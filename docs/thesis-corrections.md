# Thesis corrections for the implemented system

Memo for the LifeLink researchers. It compares the thesis text (v3.1, supplied
as `v31.txt`) with the repository at `origin/develop@733b0d7` and with the
changes queued for v0.5.0. It does not edit the `.docx`.

Prepared on 25 November 2026 on branch `docs/thesis-corrections` for issue
#132. The repository package version is `0.4.0`; the `Unreleased` section of
`CHANGELOG.md` is the v0.5.0 set. At this commit some v0.5.0 work is merged into
`develop` and some is still on a task branch. The status labels below say which
is which.

## How to read the status labels

- **Already true** - the current code and docs support the claim. The thesis
  wording is stale, or only needs a small clarification.
- **Changed in v0.5.0, merged** - the change is in `develop` at `733b0d7`, under
  the `Unreleased` section. It is not tagged as a release yet.
- **Changed in v0.5.0, pending merge** - the change is implemented on the named
  branch but is not on `develop` at `733b0d7`. Confirm it is in the submission
  build before using the replacement text.
- **Pending bench** - code or configuration exists, but no hardware result has
  been recorded. Do not write it as verified.
- **Verification needed** - the repository does not contain enough evidence.
  Confirm with the researchers before changing the thesis.

## Summary

| Item | Where | Status | Action |
| --- | --- | --- | --- |
| 1. Pin map | 3.6.3, Figure 19 | Pending bench (#54) | Do not edit either map yet |
| 2. Retry wording | 3.3.1, 3.6.2 | Already true (v0.4.0) | Replace the two sentences |
| 3. ERD and data model | 3.6.4 | Five models already true; `sent_at` fields pending v0.5.0 (#130) | Add the models; correct `AlertDelivery` now |
| 4. Roles | 3.5.1, Chapter 1 scope | Already true (v0.4.0) | Add one paragraph on the platform administrator |
| 5. Tool table | Table 1, Figure 5 | Verification needed | Confirm the tools before changing the row |
| 6. PWA and user guide | 3.6.5, 3.7.2, 3.10 | v0.5.0 (#133) merged; guide pending merge | Add the PWA text; apply the guide sentence when merged |
| 7. Transmission time | 3.8.2, 3.9.1 | v0.5.0, pending merge (#130) | Use the new `sent_at` wording only if #130 is in the build |
| 8. Retention | 3.6.5, Figure 28, privacy notice | v0.5.0 (#129) merged | Add the daily cleanup and the `CRON_SECRET` prerequisite |
| 9. Watchdog | 3.5.2, 3.7.1 | v0.5.0 (#128) merged; bench pending | Correct the claim; keep the bench result out |
| 10. Vehicles and contacts | 3.5.1, ISO item H1 | v0.5.0 (#127) merged | Add edit/archive and alert routing |
| 11. Arm/Disarm and parked impact | 3.6.5 screenshots | v0.5.0 (#137) merged | Replace or annotate affected screenshots |
| 12. Other stale claims | privacy notice, 3.6.4, 3.7.1, 3.7.2 | Mixed | Apply each correction below |
| 13. Four development cycles | Definition, 3.4.3, Table 2, 3.10 | No change | Leave as is unless the researchers add a cycle |

---

## 1. Pin map (3.6.3, Figure 19)

**Status: Pending bench (#54). Do not change the thesis pin map yet.**

**Current text (3.6.3):**

> Figure 19 shows the wiring. The MPU-6050 uses I2C on GPIO 21 (SDA) and GPIO 22
> (SCL), with its optional interrupt on GPIO 23. The SW-420 connects to GPIO 32
> and the cancel button to GPIO 33. The buzzer driver is on GPIO 25. The NEO-6M
> uses GPIO 26 and 27, and the A7670E uses GPIO 16 and 17, with its optional
> power key on GPIO 4.

**What the current code and wiring reference say:**

`firmware/include/pins.h` and `docs/wiring.md` agree with each other and differ
from the thesis:

| Signal | Thesis 3.6.3 | `pins.h` / `wiring.md` | Match |
| --- | --- | --- | --- |
| SW-420 DO | GPIO 32 | GPIO 27 | No |
| Cancel button | GPIO 33 | GPIO 33 | Yes |
| Buzzer | GPIO 25 | GPIO 25 | Yes |
| GPS RX / TX | GPIO 26 / 27 | GPIO 16 / 17 | No |
| Modem RX / TX | GPIO 16 / 17 | GPIO 18 / 19 | No |
| Modem PWRKEY | GPIO 4 | GPIO 4 | Yes |
| MPU-6050 SDA / SCL | GPIO 21 / 22 | GPIO 21 / 22 | Yes |
| MPU-6050 INT | GPIO 23 | GPIO 23 | Yes |
| Status LED | not listed | GPIO 26 | Thesis missing |
| WiFi reset | not listed | GPIO 13 | Thesis missing |
| Factory reset | not listed | GPIO 14 | Thesis missing |
| Battery / ignition sense | not listed | GPIO 34 / 35, optional | Thesis missing |

The two maps cannot be mixed. The thesis gives GPIO 26 to the GPS, while the
code gives it to the status LED. The thesis gives GPIO 16 and 17 to the modem,
while the code gives them to the GPS. A partial edit would describe a board that
does not exist.

**Why this is not a simple correction.** The thesis map matches the firmware
before commit `5a17b17` ("align the pin map with the first LifeLink board", 23
November 2026). That commit changed `pins.h` and `docs/wiring.md` to the board
map, but no hardware result is recorded in the repository. The current code is
not proof that the physical unit is wired that way.

**The bench step.** Issue #54 is the hardware gate. Its body still lists the old
rewiring prerequisite: SW-420 to GPIO 32, GPS to 26/27, modem to 16/17. That
text predates `5a17b17` and now conflicts with `pins.h`. Before the bench,
attach a note to the issue with the current candidate map, or update the issue,
so the technician does not rewire to a map the code no longer uses.

The bench record must state, for the actual unit:

1. Which module is on each of these wires: SW-420 DO, GPS TX and RX, modem TX
   and RX, PWRKEY, cancel button, buzzer, status LED, WiFi reset, factory reset.
2. The GPIO measured for each wire, with a photograph or a signed note.
3. Which map the unit follows: the thesis map or the board map in `pins.h`.

If the unit follows the thesis map, change `pins.h`, `docs/wiring.md`,
`docs/hardware.md` and any affected test, not the thesis. If the unit follows
the board map, change 3.6.3 and Figure 19. Do not change either side before the
record exists.

**Related hardware wording to check at the same bench.** The thesis says the
buzzer is driven through an NPN transistor (Table 3 and Figure 12). `pins.h`
and `docs/wiring.md` say the first board drives it directly from GPIO 25 and the
NPN is for a louder harness. Treat this as a second bench-verified detail. Do
not change Table 3, Figure 12, or the wiring until the assembled unit is
inspected.

**Do not claim** that the code is correct or that the thesis is correct. The
only verified fact is that the two maps differ and that the physical wiring has
not been recorded.

---

## 2. Retry wording (3.3.1, 3.6.2)

**Status: Already true in the system (v0.4.0). The thesis text is stale.**

**Current text (3.3.1, last sentence):**

> The device retries every 60 seconds until delivery succeeds.

**Current text (3.6.2, last sentence of the Figure 18 paragraph):**

> Pressing Cancel ends the event and records it as a false alarm; otherwise the
> device sends the alert and retries every 60 seconds until delivered.

**Corrected text (3.3.1):**

> The device retries every 60 seconds (the configured `sos_retry_s`) until the
> portal acknowledges the incident with `ACK_INCIDENT`. The alarm stays latched
> until that acknowledgement arrives, so a failed SMS or a slow HTTPS report
> does not end the alert.

**Corrected text (3.6.2):**

> Pressing Cancel ends the event and records it as a false alarm. Otherwise the
> device sends the alert, repeats the SMS and the HTTPS report every 60 seconds,
> and keeps the alarm latched until the portal acknowledges the incident with
> `ACK_INCIDENT`.

**Why.** `firmware/main/safety.h` has no timed exit from `Alerting`. The retry
interval is `sosRetryS` (default 60), and only `acknowledgeIncident()` moves the
device to `PostAlert`. `docs/safety.md` describes the same latch. The portal
command carries the device incident id (`llk-...`), not the server
`ImpactEvent.id`.

**Test wording to add.** The server deduplicates the incident record, but the
tracker deliberately sends the SMS again on each retry until the
acknowledgement. A contact can receive more than one SMS. In 3.8.2, record the
first SMS that arrives for the incident as the trial; do not count a retry as a
new trial.

---

## 3. ERD and data model (3.6.4)

**Status: The five missing models are already in the schema. The
`sentAt`/`confirmedReceivedAt` fields are v0.5.0, pending merge (#130). The
`AlertDelivery` description is wrong now and should be corrected in any case.**

**Current text (3.6.4):**

> The console stores its data in a PostgreSQL database managed through Prisma.
> The main entities are: Organization, User, and Membership (who belongs to
> which agency and with what role); Vehicle and TrackerDevice (each vehicle and
> its installed device); TelemetrySample and Trip (location and sensor
> readings); ImpactEvent (the incident) and AlertDelivery (each SMS or console
> notification and its status); DeviceCommand (configuration sent to the
> device); EmergencyContact; and AuditLog (who acknowledged, resolved, or
> changed what and when). Note to the researchers: insert the Entity
> Relationship Diagram generated from the Prisma schema here.

**Corrected text (3.6.4):**

> The console stores its data in a PostgreSQL database managed through Prisma.
> The tenant entities are Organization, User, Membership (who belongs to which
> agency and with what role), and MembershipPermission (per-member overrides of
> the role defaults); InvitationToken (a single-use, hashed invitation); Vehicle
> and TrackerDevice (each vehicle and its installed device); EmergencyContact (a
> contact attached to one vehicle, or to the organization as a fallback);
> TelemetrySample and Trip (location and sensor readings); ImpactEvent (the
> incident) and AlertDelivery (one row per phone or email target and its
> delivery state); DeviceCommand (queued commands and configuration sent to the
> device); DeviceStateEvent (device connection and fault events); OrgSettings
> (thresholds, countdown, retry, alert targets and retention periods);
> Geofence; and AuditLog (who acknowledged, resolved, or changed what and
> when). A separate PlatformAdmin row, keyed to a User, grants the internal
> `/platform` console and is not a tenant role. PushSubscription stores one
> browser push subscription per endpoint for a user. Note to the researchers:
> insert the Entity Relationship Diagram generated from the Prisma schema here.

**The five models the thesis omits.** All five are in
`apps/web/prisma/schema.prisma` at `733b0d7`:

- `PushSubscription`: `userId`, `orgId`, `endpoint` (unique), `p256dh`,
  `auth`, `userAgent`, `locale`. One row per browser push endpoint.
- `InvitationToken`: `orgId`, `email`, `role`, `tokenHash` (unique SHA-256),
  `expiresAt`, `usedAt`, `createdById`. The plaintext token exists only in the
  link shown to the admin who minted it.
- `MembershipPermission`: `membershipId`, `key`, `allowed`, unique per
  membership and key. No row means "use the role default".
- `PlatformAdmin`: `userId` (unique), `createdBy`, `createdAt`. A global row
  keyed to a User, not a `Membership` and not a `MemberRole`.
- `DeviceConfigOverride`: `deviceId` (unique), `orgId`, and six nullable
  fields: impact threshold, tilt threshold, confirm window, cancel window,
  heartbeat interval and SOS retry. A null field inherits the organization
  default.

**The two incident fields (v0.5.0, #130).** Add these only when the
`sent_at` change is in the submission build:

- `ImpactEvent.sentAt`: the moment the countdown expired, from the GPS UTC
  clock. Captured once and never replaced by a retry.
- `ImpactEvent.confirmedReceivedAt`: the first receipt of the dispatched
  `CONFIRMED` report. Later retries keep this value.

Both are nullable. The console shows the delay only when both are present and
the gap is plausible (not negative and not over one hour). See item 7.

**Correct the `AlertDelivery` description.** It is not "each SMS or console
notification." It is one row per configured phone or email target with a
status. The server does not send SMS or email: the tracker sends the SMS, and
no email sender is configured. The rows are the alert trail, not proof of
delivery. `AlertChannel` also has an `HTTP` value that the incident route does
not create. This correction does not depend on #130.

---

## 4. Roles (3.5.1, Chapter 1 scope)

**Status: Already true in the system (v0.4.0). The thesis omits the separate
platform administrator.**

**Current text (3.5.1):**

> The Administrator manages members, trackers, and system settings, including
> the detection thresholds and countdown length sent to the devices.

**Current text (Chapter 1, Scope and Delimitations):**

> The web console provides three roles: Vehicle Owner, Responder, and
> Administrator.

**Corrected text.** Keep "three roles" for the tenant console. Add this after
the Administrator sentence in 3.5.1:

> The tenant console has exactly three roles: Vehicle Owner, Responder, and
> Administrator. A separate internal platform administrator exists outside the
> tenant console. It signs in at `/platform` with its own session, can list
> organizations and suspend or reinstate one, and cannot open tenant pages
> unless the same user also has a membership. It is not a fourth tenant role
> and is outside the responder evaluation.

If the GUI paragraph says "Every user signs in on the same page", change it to
"Every tenant user signs in on the same page." The platform administrator has a
separate sign-in.

**Why.** `MemberRole` is `USER`, `RESPONDER`, `ADMIN`.
`docs/architecture.md` says the platform administrator is deliberately not a
fourth tenant role: it is a `PlatformAdmin` row with a separate
`lifelink_platform_session` cookie and a `requirePlatformAdmin()` guard. A
tenant `ADMIN` cannot reach `/platform`, and a platform admin without a
membership cannot use tenant pages.

**If the researchers prefer to keep the thesis narrow,** the alternative is one
sentence in 3.5.1: "The internal platform administration console is outside the
scope of this study." Do not leave the reader with the impression that the
console has a fourth role.

---

## 5. Tool table (Table 1, Figure 5)

**Status: Verification needed. Do not assert a tool change without evidence.**

**Current text (Table 1, "AI-assisted development" row):**

> Claude, Claude Code

**Current text (Figure 5 label):**

> Claude / Claude Code

**What the repository shows.** The repository records an OpenCode agent
workflow:

- `opencode.json` defines the project permissions for OpenCode.
- `.opencode/agents/` holds the `reviewer`, `release-manager` and `integrator`
  definitions.
- `docs/agents.md` says the definitions live in `.opencode/agents/` and that
  "OpenCode discovers them from the project."
- The issue-first, worktree and subagent workflow in `AGENTS.md` and
  `docs/agents.md` is the workflow used for the v0.4.0 and v0.5.0 changes.

The repository does not record a model per commit, and it contains no record of
Claude or Claude Code. This memo was prepared in OpenCode on DeepSeek V4.1
Flash. That is evidence for the current documentation pass, not proof of which
model wrote the earlier firmware and console code.

**Recommended corrected text, if both tool sets were used:**

- Table 1 technology cell: `Claude, Claude Code; OpenCode (DeepSeek V4.1 Flash)`
- Table 1 purpose cell: keep `Design review, documentation, and code
  implementation under researcher supervision`.
- Figure 5 label: `Claude, Claude Code, OpenCode`

**If the researchers cannot confirm Claude or Claude Code from their own
records,** use `OpenCode (DeepSeek V4.1 Flash)` alone. Do not keep a tool in the
method table that no one can confirm.

**Before submitting.** If OpenCode is added to Figure 5, add its mark with a
source line in "Figure Sources". If no suitable mark is available, use a text
label in the figure rather than an unlicensed image. The table is a factual
claim about the method, so the researchers' session records are the tie-breaker,
not the repository alone.

---

## 6. PWA and user guide (3.6.5, 3.7.2, 3.10)

**Status: The installable PWA is v0.5.0 (#133), merged. The user guide is on
the `docs/user-guide` branch (commit `b9912e2`), pending merge.**

**Current text (3.6.5, opening paragraph):**

> Figures 20 to 28 show the screens of the LifeLink web console, captured from
> the working prototype with demonstration data. Every user signs in on the
> same page; the console then shows only the screens and records allowed for
> that user's role. The interface is available in English and Tagalog.

**Corrected text (add after that paragraph):**

> The console is also an installable progressive web app. On Android, desktop
> Chrome or Edge, and Safari on iOS, the user can add it to the home screen or
> app list; the console shows install guidance where the browser supports it. A
> service worker caches only public build assets and a bilingual offline page.
> Incident, vehicle, member, and API data are never cached offline, and the app
> does not queue an acknowledgement or resolve action while offline.

**Current text (3.7.2, first sentence):**

> The console is built with Next.js and React in TypeScript and styled with
> Tailwind CSS.

**Corrected text (add after that sentence):**

> The console serves a web app manifest and registers a service worker at the
> root. The worker never caches API responses, RSC payloads, HTML documents,
> authenticated pages, or cross-origin requests; navigations are network-first
> and fall back to the offline page. It caches only the public shell and the
> offline page.

**Current text (3.10, last sentence):**

> A user guide for drivers and responders is provided.

**Corrected text (3.10, last sentence):**

> A driver and responder guide is provided in `docs/user-guide.md`; it covers
> the countdown and cancel button, the responder workflow and tracker latch,
> administrator tasks, phone installation, privacy, and troubleshooting.

**Why.** `docs/pwa.md`, `apps/web/app/manifest.ts`,
`apps/web/components/pwa/`, `apps/web/public/sw.js` and
`apps/web/public/offline.html` implement the manifest, install prompts, offline
shell and cache policy. `docs/user-guide.md` exists on the `docs/user-guide`
branch with sections for drivers, responders, administrators, phone
installation, privacy and troubleshooting. It is not on `develop` at
`733b0d7`.

**Screenshot note.** If Figures 21 and 28 were captured before v0.5.0, recapture
them. The dashboard now shows an install banner, and Settings shows an install
card. The offline page is a separate public page; if it is included, label it
as the offline shell, not as a console screen.

**Guide consistency warning.** The guide on `docs/user-guide` at `b9912e2`
still says retention is not automatic, Arm and Disarm do not change detection,
contacts are read-only and not used for routing, and the installable shell is a
separate change. Those lines are stale. Correct them before the guide is merged
or cited in 3.10. This memo does not edit another branch.

---

## 7. Transmission time (3.8.2, 3.9.1)

**Status: Changed in v0.5.0, pending merge (#130). At `733b0d7` the fields and
the console delay are not on `develop`. Confirm #130 is in the submission build
before using this text.**

**Current text (3.8.2):**

> In each confirmed trial, the device records the timestamp when the countdown
> expires and the alert is sent. The SMS receive time is read from the
> recipient phone, and the console receive time is read from the server record
> of the incident. Phone, device, and server clocks are synchronized to network
> time before testing. At least 30 trials are done at each of the three test
> sites, and the transmission time is computed per channel.

**Corrected text (3.8.2):**

> In each confirmed trial, the tracker records the moment the countdown expires,
> not the later moment a retry leaves the modem, and sends it with the confirmed
> incident report as `sent_at`. The value comes from the GPS UTC clock and is
> stored on `ImpactEvent.sentAt`. The console records the first receipt of the
> dispatched `CONFIRMED` report as `confirmedReceivedAt` and shows "Tracker sent
> at HH:MM" and "Console received N s later". The console delay is therefore
> the time from countdown expiry to the server's receipt of the confirmed
> report; it includes the SMS attempt or attempts that run before the HTTPS
> post. The SMS receive time is still read from the recipient phone. Record the
> first SMS for the incident; later retries are not new trials. Check that the
> tracker has a GPS fix before each trial: without a valid GPS date and time the
> tracker omits `sent_at`, the console shows no delay, and that trial cannot be
> used for the console metric. The phone clock is synchronized to network time;
> the device uses GPS UTC; the server uses its own clock. At least 30 trials are
> done at each of the three test sites, and the transmission time is computed
> per channel.

**Why.** On the `feat/device-sent-at` branch, the firmware captures
`g_sentAt` when the state changes to `Alerting` and back-dates it to the
countdown deadline with `dispatchSentAt()`. `sendIncident()` includes it as
`sent_at` on every report when the GPS clock is set. The incident route stores
`sentAt` and `confirmedReceivedAt`; the detail page renders the delay through
`readTransmissionDelay()`. The route keeps the first value on retries. The
helper suppresses a negative gap or a gap over one hour.

**Formula 3 (3.9.1).** The formula does not change. `tsent` is still the end of
the countdown. The correction is that the value is now recorded and stored, and
that the console delay includes the SMS attempts before the HTTPS post.

**If #130 is not in the submission build,** keep the thesis's manual method and
remove the console-delay sentence. Do not describe a field the build does not
have. The SMS channel time is still measured from the recipient phone in either
case.

---

## 8. Retention (3.6.5, Figure 28, privacy notice)

**Status: Changed in v0.5.0 (#129), merged.**

**Current text (Figure 28):**

> The settings page holds the organization details, the phone numbers and email
> addresses that receive alerts, the crash thresholds sent to the devices
> (bounded by safe limits), data retention, users and roles, the audit log, and
> system health.

**Corrected text (Figure 28):**

> The settings page holds the organization details, the phone numbers used for
> SMS alerts and the email addresses recorded as alert targets, the crash
> thresholds sent to the devices (bounded by safe limits), data retention with
> the periods enforced by a daily cleanup, users and roles, the audit log, and
> system health. It also shows the install card for the phone app.

**Current privacy notice (app).** If the thesis appendix or user guide
reproduces the privacy notice, use this text:

> LifeLink stores vehicle location and crash telemetry to deliver emergency
> alerts. Location data is available only to members of your organization. The
> retention periods in Settings are enforced by a scheduled daily cleanup:
> telemetry and incident records older than the configured period are deleted
> automatically. Incident evidence is kept for the configured period because it
> may be needed for insurance or legal review.

And the supporting paragraph:

> Telemetry and incident evidence have separate retention settings, and each
> organization's settings apply to its own data. The cleanup removes old rows
> in bounded batches and records counts in an audit log. Members of other
> organizations cannot query your vehicles or incidents.

This replaces any earlier statement that automatic deletion is not enabled.

**Owner action.** The daily job is `GET /api/cron/retention`, scheduled in both
`vercel.json` files at `15 18 * * *` (18:15 UTC; Vercel may start it within the
18:00 UTC hour on the Hobby plan). The owner must set `CRON_SECRET` in the
Vercel Production environment and redeploy. When the secret is set but the
request header is wrong or missing, the route returns `401`. When the secret is
not configured, it returns `503` and deletes nothing. The job runs on the
production deployment, not on previews.

**Why.** `apps/web/app/api/cron/retention/route.ts` enforces each
organization's telemetry and incident retention periods. It deletes in bounded
batches, supports `?dryRun=1`, and writes one `retention.cleanup` audit row per
organization with the cutoffs and counts. The privacy text is in
`apps/web/messages/en.json` (and `tl.json`). `docs/deployment.md` records the
secret and redeploy requirement.

**Do not write** "the system deletes data automatically" without the
`CRON_SECRET` prerequisite. The code fails closed when the secret is missing,
so a deployment without it enforces nothing.

---

## 9. Watchdog (3.5.2, 3.7.1)

**Status: Changed in v0.5.0 (#128), merged. The synthetic-hang reset and the
no-false-reset check are pending bench.**

**Current text (3.5.2):**

> The device must not block or hang; every modem and GPS call has a timeout and
> retry, and a hardware watchdog restarts a hung device.

**Current text (3.7.1, relevant sentences):**

> The main program runs as a non-blocking state machine (Monitoring, Countdown,
> Alerting, Cancelled), so that reading the sensors and the cancel button is
> never stopped by a slow modem response. A hardware watchdog restarts the
> device if it hangs.

**Corrected text (3.5.2):**

> The device must not block or hang. Every modem wait is bounded, the SOS is
> retried until the portal acknowledges it, and a 120-second task watchdog
> reboots the board if the main loop stops progressing.

**Corrected text (3.7.1, replacing those two sentences):**

> The main program runs as a state machine (Idle, Countdown, Alerting,
> Cancelled, PostAlert). The A7670E transport is still blocking: a single HTTPS
> request can hold the loop for up to about 87 seconds, and two SMS can take up
> to 54 seconds. The loop task is subscribed to the ESP32 task watchdog with a
> 120-second timeout and panic enabled. The watchdog is fed only at the end of
> each bounded phase, so a loop that stops progressing is configured to panic
> and reboot the board. A watchdog reset does not preserve a latched alarm: the
> unit boots to Idle and the incident must be resolved from the console.

**Why.** `firmware/main/main.ino` defines `kWatchdogTimeoutS = 120`, calls
`esp_task_wdt_init(kWatchdogTimeoutS, true)`, subscribes the loop task and
feeds it after each bounded phase. `docs/safety.md` records the same timeout,
the panic, the feed points and the power-loss limit. `docs/current-state.md`
still lists the blocking modem path as a gap: the watchdog bounds a hang, it
does not make the transport non-blocking.

**Bench step.** The synthetic hang uses `TEST_WDT CONFIRM` in
`env:esp32dev-bench`; the default build refuses the command. The no-false-reset
check runs a normal alert, cancel and acknowledgement cycle and confirms the
watchdog does not reset the board. Both are pending. Do not write "verified on
hardware" or "the watchdog was tested".

**Related correction.** The thesis's "non-blocking state machine" claim is not
true for the modem path. Use the corrected text above. This is a claim
correction, not a bench result.

---

## 10. Vehicles and contacts (3.5.1, ISO item H1)

**Status: Changed in v0.5.0 (#127), merged. The thesis claim is now true.**

**Current text (3.5.1):**

> The Vehicle Owner logs in, registers the vehicle and emergency contacts,
> cancels a false alarm using the device button, views the history of the
> vehicle, and receives SMS alerts.

**Current text (ISO questionnaire, H1):**

> Emergency contacts and vehicles can be changed from the console without a
> technician.

**Corrected text (3.5.1):**

> The Vehicle Owner logs in, registers a vehicle, adds and edits its emergency
> contacts, cancels a false alarm using the device button, views the vehicle
> history, and receives SMS alerts. The Administrator can add, edit and archive
> any vehicle and its contacts in the organization.

**ISO item H1.** No change. The statement is now supported. If an earlier draft
or figure describes contacts as read-only, replace it.

**Why.** `apps/web/lib/actions/vehicles.ts` and
`apps/web/lib/actions/emergency-contacts.ts` let an owner manage only their own
vehicle and its contacts, and an admin manage the whole organization. Every
create, edit and archive writes an audit row. A vehicle with incidents or a
tracker is archived as `RETIRED`, never hard-deleted.

**Alert routing.** A vehicle's active contacts are merged ahead of the
organization phone and email list, deduplicated, and capped at ten targets per
channel. The tracker's command poll sends up to two contact phones as
`alert_phones`; if the vehicle has none, the organization list is the fallback.
One phone is one row per organization, so a shared contact belongs to the
primary vehicle and the organization list remains the fleet fallback.

**Figure 6.** If the use-case diagram shows contacts as read-only or
administrator-only, redraw it. The owner has the manage-vehicles-and-contacts
use case.

**Implementation note, not thesis text.** The console's notifications page
still has a stale `contactsSubtitle` string in `apps/web/messages/en.json` and
`tl.json` that says contacts are read-only and not used for routing. That
contradicts v0.5.0 and should be fixed in a separate code or copy change. The
thesis does not contain that sentence.

---

## 11. Arm/Disarm and parked impact (3.6.5, Figures 27 and 28)

**Status: Changed in v0.5.0 (#137), merged.**

**Current text.** There is none. The v3.1 thesis text does not mention Arm,
Disarm, or a parked-impact setting. The risk is in the screenshots.

**If a screenshot shows either control,** replace the screenshot with a current
capture. If the old screenshot must stay for comparison, add this caption:

> Detection is always on. The console has no Arm or Disarm control, and the
> firmware answers either command as `unsupported` without changing safety
> state. The parked-impact setting is not part of the current build; an impact
> while parked follows the same detection, countdown, and alert path.

**What to inspect.** Figures 20 to 28, especially Figure 27 (Administrator:
Trackers) and Figure 28 (Administrator: Settings). The tracker page no longer
offers Arm or Disarm. Settings no longer shows a parked-impact toggle.

**Why.** The `Unreleased` changelog entry says crash detection is always on, the
tracker page no longer offers Arm or Disarm, the admin command allowlist rejects
both kinds, and the firmware acknowledges them as `unsupported`. The unused
`g_armed` flag is removed. `OrgSettings.parkedImpactAlerts` stays as a reserved
column: it is not read, not exposed, and not part of the firmware configuration
envelope. `docs/safety.md` says there is no parked mode.

---

## 12. Privacy notice and other stale claims

### 12a. Privacy notice

**Status: Changed in v0.5.0 (#129), merged.**

Use the current text in item 8. The notice now says the retention periods are
enforced by a scheduled daily cleanup and that telemetry and incident records
older than the configured period are deleted automatically. Replace any earlier
statement that automatic deletion is not enabled, including in the user guide or
an appendix. The thesis body does not quote the notice in v3.1.

### 12b. Figure 28 email wording

**Status: Correct now; the email sender does not exist.**

Replace "the phone numbers and email addresses that receive alerts" with "the
phone numbers used for SMS alerts and the email addresses recorded as alert
targets." The server has no email sender. In a live incident, `AlertDelivery`
rows with channel `EMAIL` stay queued; the tracker's SMS is the SMS that reaches
phones. This is the same correction as item 8.

### 12c. 3.6.4 `AlertDelivery`

**Status: Correct now.**

Replace "each SMS or console notification and its status" with "one row per
phone or email target and its delivery state." The server does not send SMS or
email, and the incident route does not create `HTTP` delivery rows. See item 3.

### 12d. 3.7.1 non-blocking claim

**Status: Correct now; not a bench result.**

Replace the non-blocking claim with the corrected text in item 9. The modem
transport blocks the loop for seconds. The watchdog bounds a hang; it does not
make the transport non-blocking.

### 12e. 3.7.2 "do not create duplicate alerts"

**Status: Correct now; clarification only.**

The server deduplicates the incident record by device and client incident id. It
does not stop the tracker from sending the SMS again on each retry. If the
sentence is read as "one SMS only", add: "The server deduplicates the incident
record; the tracker may send more than one SMS while the alarm is latched."

### 12f. Screenshots

**Status: v0.5.0 changes; recapture if the current screenshots predate them.**

Check Figures 20 to 28 for these changes:

- dashboard install banner (Figure 21);
- Settings install card (Figure 28);
- tracker page without Arm or Disarm (Figure 27);
- Settings without a parked-impact toggle (Figure 28);
- vehicle add, edit and contact controls (Figures 25 and 26);
- incident detail without a stale action that the current role cannot use.

A current screenshot is better than a caption that explains a control the
system no longer has.

### 12g. 3.4.4 device token wording

**Status: Clarification; the server-side hash is already true.**

**Current text (3.4.4):**

> the device token is stored only as a hash

**Corrected text (3.4.4):**

> the server stores the device token only as a SHA-256 hash; the tracker keeps
> the token in its own non-volatile storage so it can authenticate

**Why.** The server never logs the device token and the database stores only the
hash. The device must hold the plaintext token to send it. The unqualified
sentence can be read as "no plaintext copy exists anywhere", which is not true.
This is a wording correction, not a security finding.

---

## 13. Four development cycles

**Status: No change.**

**Current text (Definition of Terms):**

> In this study, it refers to the model used to plan, build, test, and evaluate
> LifeLink in four cycles.

**Current text (3.4.3):**

> The researchers completed the development cycle four times, as summarized in
> Table 2.

**Current text (3.10, opening):**

> After the fourth iteration, when the evaluation criteria are met, the
> validated system is finalized: the web console is deployed on Vercel for use
> by the partner responders, and the device is prepared for pilot installation
> in volunteer vehicles.

**Corrected text.** None.

**Why.** Four cycles is a research-process claim, not a commit count. The
repository has many commits and several release batches (`package.json` is
`0.4.0`, the `Unreleased` section is the v0.5.0 set), but a release batch is not
an iteration. No evidence in the repository contradicts four cycles.

If the researchers count the v0.5.0 work as a fifth cycle, update the
Definition of Terms, 3.4.3, Table 2 and 3.10 together. Otherwise leave the
claim as it is. Do not change "four" to match the number of releases.

---

## 14. Claims checked and left unchanged

These were spot-checked against the code and docs. No correction is needed
unless the researchers' own records say otherwise.

| Claim | Where | Evidence |
| --- | --- | --- |
| The tenant console has three roles | 3.5.1, scope | `MemberRole` is `USER`, `RESPONDER`, `ADMIN`; `docs/architecture.md` |
| Default thresholds: 2.5 g, 60 degrees, 200 ms, 15 s, 60 s retry | 3.3.1, 3.6.2, Table 2 | `OrgSettings` defaults in `schema.prisma`; `config.h` |
| Server stores only the device token hash | 3.4.4 | `TrackerDevice.tokenHash`; `docs/architecture.md` |
| English and Tagalog interface | 3.4.1, 3.6.5 | `apps/web/messages/en.json`, `tl.json` |
| SMS and HTTPS channels | 1, 3.3.1, 3.6.1 | `firmware/main/main.ino` |
| Map, incident workflow, acknowledge and resolve | 3.6.5, 3.7.2 | dashboard, incidents and map pages |
| Audit log for acknowledge, resolve and configuration | 3.7.2 | server actions write `AuditLog` rows |
| Device identity, token and phone numbers in NVS | 3.7.1 | `prefs` keys in `main.ino` |

The ISO/IEC 25010 definitions, the questionnaire items, Table 4 (respondents),
Table 5 (scale) and the statistical formulas are research-instrument content.
They are outside this code comparison and were not changed.

---

## 15. Not verified: do not claim

The repository does not contain a hardware or bench result for these. Keep them
out of the thesis, or mark them pending bench:

- the physical pin map, including the SW-420, GPS, modem, PWRKEY, status LED and
  reset buttons;
- the buzzer driver (direct GPIO or NPN);
- the watchdog synthetic-hang reset on a real unit;
- the absence of a false watchdog reset through a normal alert, cancel and
  acknowledgement cycle;
- GPS cold-start time and accuracy in the installed unit;
- SMS delivery on the actual carrier and SIM;
- power behavior with the actual buck, cells and modem;
- the false-positive rate on real roads.

These are pending a merge or a researcher confirmation, not a bench result:

- the `sent_at` field and console delay, until #130 is merged into the
  submission build;
- the user guide, until `docs/user-guide` is merged;
- a change of AI tool, until the researchers confirm it from their own records.

The code and docs can support a design claim. They cannot support a bench
result.

---

## 16. Researcher checklist

1. Apply items 2, 4, 10 and 11 to the text and screenshots.
2. Apply item 6 when `docs/user-guide` is merged. Apply item 8 when v0.5.0 is
   the submission build. Apply item 7 only after confirming that #130 is
   included.
3. Keep 3.6.3 and Figure 19 unchanged until the #54 bench record exists. Attach
   the current candidate map to #54 before the technician starts.
4. Confirm item 5 with your own session records before changing Table 1 or
   Figure 5.
5. Rebuild the ERD from `apps/web/prisma/schema.prisma`. If #130 is not merged,
   omit `sentAt` and `confirmedReceivedAt`; do not draw them from memory.
6. Recapture any screenshot that shows an install surface, a vehicle or contact
   editor, Arm or Disarm, or a parked-impact toggle.
7. Replace any privacy notice that says automatic deletion is not enabled.
8. Read the final draft for these stale phrases: "until delivery succeeds",
   "until delivered", "read-only" contacts, "Arm", "Disarm", "parked impact",
   "every user signs in on the same page", "non-blocking state machine",
   "stored only as a hash", and "email addresses that receive alerts".
9. Do not add a bench result, a pin map, or a tool change that the evidence does
   not support.

If a section number in the `.docx` differs from the numbering in `v31.txt`,
keep the `.docx` numbering and use the quoted sentence to locate the text.
