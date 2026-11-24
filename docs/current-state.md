# Current state

## Product state (2026-11-22)

- **Stack:** Next.js 16 App Router + React 19, Supabase Postgres + Prisma,
  next-intl (English/Tagalog), Tailwind 4, Biome, Vitest and Playwright.
- **Roles:** `USER` (own vehicles), `RESPONDER` (whole fleet, incidents) and
  `ADMIN` (members, trackers, settings). Org scope comes from the membership row;
  the app-level orgId filters are authoritative.
- **Pages:** dashboard, devices (trackers), vehicles, incidents, settings, login
  and public legal pages. Tracker detail and incident detail exist.
- **Device API:** `/api/device/ingest` (heartbeat + batched telemetry),
  `/api/device/incident`, `/api/device/incident/cancel`, `/api/device/command`,
  `/api/device/command/ack`, plus the signed firmware check. Device tokens are
  SHA-256 hashed, approved-only, and the incident route already deduplicates on
  `(deviceId, clientIncidentId)`.
- **Product gaps:** tracker registration errors/duplicates (T1), a dedicated
  heartbeat endpoint and per-device rate limits (T4), tracker actions (T2/T3),
  incident workflow/map/timeline (T6), alert delivery status (T7), live KPIs
  and maps (T8/T9), and API/workflow tests (T15). The shared queue is
  [`../TASKS.md`](../TASKS.md).
- **Verification:** `pnpm self-check` is the local gate; the web job runs lint,
  typecheck, Vitest, the RLS test against a disposable Postgres service and the
  production build. Firmware has its own `scripts/verify.sh` gate.

## Accessibility evidence (2026-11-23)

`pnpm a11y` (`node scripts/a11y.mjs`) is the repeatable axe check. It signs in
with the demo admin, measures the login page before authentication and the
console routes after it, and writes `reports/a11y/latest.json` plus a Markdown
summary. It needs the app running (`E2E_BASE_URL`, default
`http://localhost:3000`) and Playwright Chromium.

Latest run: branch `chore/axe-gate` from `develop@105eb2e`, axe-core 4.14.1,
desktop 1440x900.

| Result | Count |
| --- | --- |
| Routes measured | 9 of 9 |
| Critical violations | 0 |
| Serious violations | 0 |
| Moderate violations | 10 |
| Minor violations | 0 |

The result is a **pass for serious and critical violations**: 9/9 routes were
measured, with zero serious or critical findings. The ten moderate violations
are missing landmarks (`region`, `landmark-one-main`); the login page accounts
for most of the affected nodes. The dashboard incident-trend chart's horizontal
scroller now has keyboard access (`bar-chart.tsx` uses a focusable `<section>`),
so the previous `scrollable-region-focusable` finding is closed. The gate exits
`1` on a serious or critical violation, `2` when the app is unreachable or a
route cannot be measured, and `0` when no serious or critical violation is
found. An unreachable run is recorded as **NOT RUN**, never as a pass.

The check is not part of CI; wiring it in is a separate policy decision
(`.github/` is out of scope for this change).

## Firmware setup baseline (2026-11-22)

Snapshot: 2026-11-22, branch `develop` at `feb8297`, firmware version `0.1.0`.

This note is the baseline for the agent setup. It records what exists before the
work phases start, so later changes can be compared against it.

## What exists

LifeLink is a monorepo with two runtimes:

- `apps/web/` — Next.js console, three-role access, device API, Prisma schema,
  incidents and firmware configuration envelope.
- `firmware/` — PlatformIO project for the ESP32 tracker.

The firmware is **already a PlatformIO project**, not an Arduino `.ino` folder
outside a build system. No migration was needed.

## Firmware layout

| File | Responsibility |
| --- | --- |
| `firmware/main/main.ino` | I/O orchestration: IMU, SW-420, GPS UART, modem UART, buzzer, provisioning, heartbeat, command poll |
| `firmware/main/config.h` | Versioned configuration envelope and defaults (Arduino-free) |
| `firmware/main/filters.h` | Impact/tilt/vibration fusion and debouncer (Arduino-free) |
| `firmware/main/safety.h` | Countdown, cancel, retry, faults, reset history, intervals (Arduino-free) |
| `firmware/main/gps.h` | Fix validation (Arduino-free) |
| `firmware/main/power.h` | ADC scaling and power classification (Arduino-free) |
| `firmware/main/provisioning.h` | Setup AP name, form/NVS validation, boot reset gesture (Arduino-free) |
| `firmware/main/status.h` | Buzzer patterns (Arduino-free) |
| `firmware/main/modem.h` | Bounded ASCII SOS body (Arduino-free) |
| `firmware/main/hardware.h` | `hw::` aliases over the canonical pin map |
| `firmware/include/pins.h` | Canonical GPIO map (added by the setup) |
| `firmware/test/` | 47 native Unity tests across config, filters, provisioning and safety |

The pure headers are compiled on the host by the `native` PlatformIO
environment. The sketch needs the ESP32 core and is excluded from that build.

## Existing features

- Impact + tilt + vibration confirmation with pothole, door-slam, braking and
  rollover cases covered by native tests.
- Countdown, cancel button debounce and buzzer patterns.
- SMS to two NVS-stored numbers; HTTP incident, cancel, heartbeat, command poll
  and command acknowledgement through the A7670E.
- Versioned configuration from the server, validated against a min/max envelope
  and persisted in NVS.
- Serial provisioning (`SET_ID`, `SET_TOKEN`, `SET_PHONE1`, `SET_PHONE2`,
  `SET_PLATE`, `STATUS`, `REBOOT`) and the WiFi commissioning portal
  (test-before-save, 10-minute lifetime, GPIO 33 boot reset). WiFi is
  commissioning-only; the A7670E remains the uplink.
- Server-side contract drift test parses `firmware/main/config.h`.

## Existing CI

`.github/workflows/ci.yml` runs:

- web: `pnpm stack:check`, lint, typecheck, tests and build;
- firmware: native tests and the ESP32 build.

## Gaps against the agent setup guide

These are inputs for the Phase 1 audit, not changes made by the setup:

1. **Watchdog is enabled, bench proof pending.** The `loop()` task is
   subscribed to `esp_task_wdt` with a 120 s timeout and panic enabled; feeds
   sit between bounded phases. The synthetic hang is a hardware bench step.
2. **The modem/GPS path still blocks.** `main.ino` has bounded waits, but several
   AT calls block the loop for seconds; `delay()` is used inside the transport
   and during PWRKEY power-on. The watchdog now bounds a hang that outlives
   those waits.
3. **No offline alert queue.** A failed SMS/HTTP alert is retried only while the
   device stays in the alert state; it is not replayed after a reboot.
4. **No reset-reason logging or boot self-test.** The reset history class exists,
   but `main.ino` does not feed it from `esp_reset_reason()`, and there is no
   boot check for the IMU, GPS, modem and rail.
5. **Docs overstate two behaviours.** `docs/safety.md` says a pending countdown
   is recovered from NVS and that three abnormal resets enter safe mode. The
   current `main.ino` implements neither; the pure `ResetHistory` helper exists
   but is not wired in, and the incident id is not persisted before the
   countdown.
6. **No structured logging or flash event history.** Serial logs are ad-hoc
   `Serial.printf` lines.
7. **No OTA update path** in the firmware (the server endpoint exists, the
   device half does not).
8. **No clang-format configuration or static analysis in CI.** The setup adds
   both.
9. **No root `AGENTS.md`, `opencode.json`, `scripts/verify.sh` or Dependabot
   configuration.** The setup adds them.

## What the setup deliberately did not duplicate

The guide describes a standalone firmware repository. This is a monorepo with an
established `firmware/` project, so the setup merges instead of creating a
second tree:

- There is no root `platformio.ini`; the project stays at `firmware/`.
- There is no `firmware/src/` copy of the existing modules. The module split is
  already present as Arduino-free headers under `firmware/main/`.
- Pins moved from `firmware/main/hardware.h` to `firmware/include/pins.h`;
  `hardware.h` now aliases them, so GPIO numbers appear once.
- `docs/wiring.md` is the canonical wiring reference; `docs/hardware.md` keeps
  the sensor notes, bench checklist and BOM and links back to it.

## Verification

The setup gate is `scripts/verify.sh` (ESP32 build, native tests, static analysis
and formatting). Local setup run on Windows, 2026-11-22:

| Step | Result |
| --- | --- |
| `pio run -d firmware` | **PASS** — RAM 7.1%, flash 18.9% |
| `pio test -d firmware -e native --without-testing` | **PASS** — all 3 suites compile |
| `pio test -d firmware -e native` | **BLOCKED locally** — Windows Application Control refuses to execute newly built test binaries; CI runs them |
| `pio check -d firmware --fail-on-defect high` | **PASS** — after suppressing a cppcheck false positive in ArduinoJson |
| clang-format 18.1.8 check | **PASS** via the LLVM 18.1.8 WebAssembly build; the native pip binary is blocked by the same Application Control policy |

The PR CI is the authoritative run for the native test execution. This note does
not claim a local test execution that the operating system prevented.
