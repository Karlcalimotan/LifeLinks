# Provisioning, remote cancel and multi-tenancy — consolidated plan

Status: **draft for decisions. No production code written.** 2026-11-22.
Evidence base:
- `S:\Dev\LifeLinks` @ `main` `4e71a36` (agent: incident/command map)
- reference implementation, commit `d027ddb` (agent: provisioning/tenancy port spec)
- `S:\Dev\accident detection` @ `develop` (agent: modular firmware split)

---

## 0. Frame check

The request bundles **four workstreams** with different blockers. Treating them as one
"multi-tenancy feature" would hide the fact that two of them cannot start yet.

| # | Workstream | Blocked by | Can start now? |
| --- | --- | --- | --- |
| A | Remote cancel + push notification | decision on cancel timing and firmware target | No |
| B | WiFi provisioning | decision on what WiFi is *for* | No |
| C | Tenancy hardening (invites, RLS, platform admin) | decision on scope | **Yes** |
| D | Modular firmware + admin-editable config | decision on contract ceiling / rollover / factory profile | **Yes** |

---

## 1. Verified current state

### 1.1 Remote cancel is a database label

| Claim | Evidence |
| --- | --- |
| Web Cancel writes `status=CANCELLED`, `cancelledAt`, `resolution`, one audit row. Nothing else. | `lib/actions/incidents.ts:46-65` |
| No `DeviceCommand`, no `DeviceStateEvent`, no notification is created by it. | same |
| The device cancel endpoint exists but authenticates with a **device token**, so a browser cannot call it. | `app/api/device/incident/cancel/route.ts:24` |
| The firmware has no handler for a cancel command; `CrashSafety::markAcknowledged()` is defined and never called. | `firmware/main/safety.h:59` |
| After dispatch the device retries SMS + incident POST every `sosRetryS` for 10 minutes. A web cancel does not stop it. | `main.ino:785-794` |
| No push, email or server SMS sender exists. `AlertDelivery` is write-only, with no CANCELLED status. | `schema.prisma:60-65,292-307` |
| No service worker, VAPID key, subscription table, or cron dispatcher. | `public/`, `app/manifest.ts`, `vercel.json` |

### 1.2 Timing

| Fact | Value | Evidence |
| --- | --- | --- |
| Command poll | 5 s | `main.ino:63` |
| Cancel window default | 15 s (5–60) | `config.h:27` |
| Countdown → SMS | immediate on expiry | `main.ino:785-789` |
| AT/HTTP blocking | up to 30 s per request; SMS 5 s + 20 s | `main.ino:294-296,332-336` |
| Cancel button sampling | starved during blocking POSTs | `main.ino:765,771` |

**Conclusion:** a web cancel cannot reliably arrive inside 15 s while the modem blocks the loop.
This is a firmware property, not a server one.

### 1.3 Provisioning has no consumer

LifeLinks firmware has **no WiFi code**; uplink is the A7670E (`main.ino:13,700`,
`hardware.h:33`). Provisioning today is serial: `SET_ID`, `SET_TOKEN`, `SET_PHONE1/2`,
`SET_PLATE` (`main.ino:622-661`).

A SoftAP portal only makes sense if the board has a WiFi role. Options in §3.

### 1.4 Config contract already exists and is narrower than Phase 1

| Field | Envelope | Default | Phase 1 value |
| --- | --- | --- | --- |
| `impact_threshold_g` | 1.5–5.0 | 2.5 | 2.8 |
| `tilt_threshold_deg` | 30–90 | 60 | 60 |
| `confirm_window_ms` | 100–2000 | 200 | 300 |
| `cancel_window_s` | 5–60 | 15 | 10 |
| `heartbeat_interval_s` | 10–300 | 30 | inert |
| `sos_retry_s` | 30–300 | 60 | inert |

Evidence: `firmware/main/config.h:23-29`, `apps/web/lib/firmware/config.ts:33-82`.

Consequence: **the first server sync retunes the bench** 2.8 → 2.5 g and 10 → 15 s.
2.5 g is more sensitive, so that is a false-positive regression unless org defaults are seeded.

---

## 2. Workstream A — remote cancel and notifications

### 2.1 Required pieces

1. **`CANCEL_ALERT` command kind** carrying `{incidentId, reason}`. Today `CommandKind` has
   LOCATE/ARM/DISARM/TEST_ALERT/SET_CONFIG (`schema.prisma:67-74`).
2. **Firmware handler** that, only while `Countdown`:
   - aborts the countdown,
   - stops the SMS retry ladder,
   - posts `/api/device/incident/cancel` (already exists),
   - ACKs the command with the resulting state.
3. **Abort points inside `sendSmsAlerts()`** — before recipient 1 and between recipients — so a
   cancel that lands mid-send still suppresses the second message (`main.ino:501-528`).
4. **Faster poll while armed or counting** — 1 s during COUNTDOWN, 5 s otherwise.
5. **Server action** `cancelIncidentAction` must create the command and mark the incident
   `CANCELLED` only on ACK, not optimistically.
6. **Post-dispatch path** — `FALSE_ALARM` must stop device retries (`markAcknowledged`) and send
   an all-clear SMS to the same recipients.
7. **Push subsystem** — see 2.3.

### 2.2 Cancel window options

| Option | Window | Poll | Modem | Trade-off |
| --- | --- | --- | --- | --- |
| a | 30 s | 1 s | unchanged | reliable remote cancel, slow SOS |
| b | 15 s | 1 s | **non-blocking refactor** | correct, largest firmware change |
| c | 15 s | 1 s | unchanged | best-effort; may lose the race |
| d | 15 s + server ack hold | — | — | **rejected**: network in the emergency path |

Recommendation: **b** if remote cancel is a product requirement, **c** if it is a demo.
Never **d**.

### 2.3 Push

Nothing exists. Minimum build:
- VAPID keypair (`WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`).
- `PushSubscription` table (userId, orgId, endpoint, p256dh, auth, createdAt, revokedAt).
- Service worker + subscription UI on the incidents page.
- Sender used by the incident creation path and the escalation cron.
- Notification payload: incident id, plate, peak g, time; click opens the incident with a large
  Cancel button. Inline action button on Android; iOS uses tap-to-open.
- Security: subscriptions are user-scoped, revoked on logout, and an endpoint is never logged.

---

## 3. Workstream B — WiFi provisioning

### 3.1 The precondition

Pick what WiFi is for:

| Option | Meaning | Firmware cost |
| --- | --- | --- |
| B1 | **Commissioning only** — portal sets identity; WiFi saved for OTA/diagnostics but not used for telemetry | Medium; portal + NVS, no uplink code |
| B2 | **Commissioning + OTA over WiFi** | Medium+; adds ArduinoOTA/HTTPS OTA |
| B3 | **Fallback uplink when 4G is down** | High; adds a second transport and failover policy |
| B4 | **No WiFi** — keep serial provisioning, improve the installer UX | None |

Recommendation: **B1**, then B2. B3 duplicates the modem path and doubles the failure surface.

### 3.2 What to port from the reference implementation

| Pattern | Why it matters | Tag |
| --- | --- | --- |
| Test-before-save join (20 s, 6 s quick-fail, save only on proven link) | a wrong password never overwrites working credentials | port |
| Async scan state machine with retry and stuck-abort | fixes scan-while-connecting | port |
| No read-back of token or password; escaped output | credential hygiene | port |
| Fail-closed gate: unprovisioned unit makes no API calls | safety property | port |
| Reset-button hygiene: 50 ms debounce, 5 s grace, factory beats WiFi | prevents stuck-button resets | port |
| AP naming `PREFIX-XXXX` from eFuse MAC, drift-tested against the web | avoids sticker/device mismatch | port (new prefix) |
| Device-ID field in the portal | LifeLinks already derives it from the MAC | drop |
| Feed-button reset path | tied to the reference firmware's relay | drop |

### 3.3 Pin constraint

LifeLinks uses 33 (cancel), 32 (SW-420), 26/27 (GPS), 16/17 + 4 (modem), 25 (buzzer), 21/22 (I2C).
There is no free pin pair for two reset buttons. Recommendation: **reuse GPIO 33 at boot** —
5 s clears WiFi, 10 s factory reset. This must be tested against the cancel-button debounce.

### 3.4 Schema

No WiFi columns required. Optional: `TrackerDevice.wifiConfiguredAt` to distinguish
"never provisioned" from "offline".

---

## 4. Workstream C — tenancy

### 4.1 Reality check

RLS is **enabled** on all LifeLinks tables but **no policies exist** (`20261118000100_enable_rls`).
Prisma connects as the owner and bypasses RLS. App-level `orgId` filters are the only boundary.

The reference implementation's lesson, verbatim: *do not claim RLS is the tenant boundary until the app role changes*
(`docs/database-rls-retention.md:17,36-55`).

### 4.2 Minimum schema additions

| # | Change | Why |
| --- | --- | --- |
| 1 | `Membership.revokedAt`, `invitedBy` | soft revocation; every gate assumes it |
| 2 | `MembershipPermission` | per-member grant/deny without new roles |
| 3 | `Organization.status`, `suspendedAt`, `suspendedReason` | suspended org grants nothing |
| 4 | `InvitationToken` (orgId, email, role, tokenHash, expiresAt, consumedAt) | real invite flow; LifeLinks has real emails, unlike the reference platform |
| 5 | `PlatformAdmin` (userId unique, expiresAt, revokedAt, mfaEnrolledAt) | god mode separate from tenant ADMIN |
| 6 | Platform audit fields or `PlatformAuditLog` | reason, step-up, before/after — one audit table, not two |

Optional: `PasswordResetToken` if invite links are tokenised.

### 4.3 RLS

Add per-org policies as defense in depth, with a role that is **not** the table owner, plus a test
that connects as that role. Keep app guards authoritative.

---

## 5. Workstream D — modular firmware and admin config

### 5.1 Module tree

```
main/
  main.cpp        setup/loop only; only file touching Arduino APIs
  board.h         BoardProfile + compile-time selection
  board_phase1.h  pins, polarities, factory config
  hardware.h      values-only facade
  config.h        contract fields, envelope, defaults, validate   [pure]
  config_store.h  blob encode/decode                              [pure]
  filters.h       gravity LPF, tilt, SW-420 edge                  [pure]
  detector.h      crash/rollover state machine                    [pure]
  safety.h        countdown, cancel, re-arm                       [pure]
  status.h        buzzer + LED pattern tables                     [pure]
  inputs.h / outputs.h                                            [Arduino]
  config_store_nvs.h                                              [Arduino]
  console.h       serial config console (Stream interface)
test/
  test_config, test_filters, test_detector, test_safety, test_status
```

### 5.2 Config fields

Existing six, plus:

| Field | Type | Range | Default |
| --- | --- | --- | --- |
| `buzzer_enabled` | 0/1 | 0–1 | 1 |
| `led_enabled` | 0/1 | 0–1 | 1 |
| `remote_cancel_enabled` | 0/1 | 0–1 | 1 |

Booleans are 0/1 floats because the drift test parses the header with a numeric regex
(`config.test.ts:22-26`).

Cross-field invariant: `buzzer_enabled || led_enabled` — an admin must not be able to produce a
device with no local annunciation.

### 5.3 Defects to fix during the split

| Defect | Evidence |
| --- | --- |
| Header comment still says buzzer 26 / LED 25 | `src/main.cpp:7-9` |
| Idle level written after `pinMode`, boot chirp on active-LOW parts | `src/main.cpp:731-735` |
| Tilt reference not persisted; reboot on a slope redefines upright | `src/main.cpp:237-248,777` |
| Config applied mid-countdown without resetting the detector candidate | LifeLinks `main.ino:361` |
| `SET_CONFIG` ACKs unconditionally (blind ack) | LifeLinks `main.ino:560-563` |

### 5.4 Contract conflicts

| Conflict | Phase 1 | LifeLinks | Decision |
| --- | --- | --- | --- |
| Impact ceiling | 4.5–5.5 g documented | max 5.0 | Q8 |
| Rollover hold | 2000 ms | 1000 ms | Q9 |
| Factory profile vs defaults | 2.8 g / 10 s | 2.5 g / 15 s | Q10 |

---

## 6. Roadmap and worktree split

Nothing merges to `develop` without its own branch and verification.

| Task | Repo | Branch | Depends on |
| --- | --- | --- | --- |
| D0 baseline tag + off-machine backup | accident detection | `chore/baseline` | — |
| D1 modular split, constants unchanged | accident detection | `feat/phase1-modular` | D0 |
| D2 config seam + console (`CONFIG`, `SET_CONFIG`) | accident detection | `feat/phase1-config` | D1 |
| D3 new fields + defect fixes | accident detection | `feat/phase1-config-fields` | D2, Q5/Q8/Q9/Q10 |
| C1 invites + soft revoke | LifeLinks | `feat/tenant-invites` | Q7 |
| C2 RLS policies + non-owner test | LifeLinks | `feat/rls-policies` | C1 |
| A1 `CANCEL_ALERT` command + server action | LifeLinks | `feat/remote-cancel` | Q1/Q2/Q4 |
| A2 firmware handler + abort points + poll cadence | LifeLinks firmware | `feat/firmware-remote-cancel` | A1, Q4 |
| A3 push subsystem | LifeLinks | `feat/web-push` | Q3 |
| B1 portal on LifeLinks firmware | LifeLinks firmware | `feat/wifi-portal` | Q6, B decision |
| B2 dashboard setup panel | LifeLinks | `feat/provisioning-panel` | B1 |
| M1 merge Phase 1 into LifeLinks firmware | LifeLinks | `feat/phase1-merge` | D3, Q4 |

Parallel-safe now: D0 → D1, C1, A3 (server-only), B2 design.
Blocked: A1/A2 (timing + firmware), B1 (WiFi role), M1 (after D3).

---

## 7. Decisions still open

1. Countdown/poll strategy: 30 s / non-blocking 15 s / best-effort 15 s. (Recommend non-blocking 15 s if remote cancel is real.)
2. Pre-dispatch only, or also post-dispatch false alarm with all-clear SMS. (Recommend both.)
3. Push: Web Push + SMS fallback, or SMS only, or email. (Recommend Web Push + SMS.)
4. Firmware target: LifeLinks firmware (rewire) or Phase 1 sketch. (Recommend LifeLinks.)
5. Admin-editable scope: all nine fields, or thresholds/timings only. (Recommend all nine.)
6. WiFi role: commissioning only / + OTA / fallback uplink / none. (Recommend commissioning then OTA.)
7. Tenancy: invites + RLS now, platform admin later; production or capstone. (Recommend later + state the product stage.)
8. Impact ceiling: 5.0 g cap, or contract v2 at 6.0. (Recommend 5.0.)
9. Rollover hold: 2000 ms Phase 1 + 1000 ms LifeLinks, or standardise. (Recommend per-profile.)
10. Seed org defaults to 2.8 g / 10 s before first sync, or accept 2.5 / 15. (Recommend seed.)

## 8. Immediate risks

- **No git remote on the Phase 1 repo** — no off-machine recovery point. Tag and back up before D1.
- **The cancel button is the only local stop**, and it is starved during blocking modem calls.
- **RLS is not a boundary today**; anyone assuming it is would be wrong.
- **The first config sync retunes the device** to more sensitive values.
