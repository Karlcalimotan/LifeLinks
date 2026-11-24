# Safety model

LifeLink is an alerting system. Its dangerous failure is a **missed alert**, not
an unwanted output. That is the opposite of an actuator system, where refusing
to act is usually the safe direction. The rules below follow from that
inversion.

## Priorities

1. A confirmed crash must reach a human.
2. A false alarm must be cancellable, visible and cheap to resolve.
3. Uncertainty must never silently suppress the SOS.
4. The driver must not be able to cancel by accident.
5. The system must keep working when the backend, the car battery or the GPS is
   unavailable.

## Detection is always on

There is no arm or disarm. The tracker monitors impacts from boot, whether the
ignition is on or off, and the console offers only Locate and Test alert as
tracker actions. A posted `ARM` or `DISARM` command is acknowledged as
`{ "detail": "unsupported" }` and changes no safety state. Historical
`DeviceCommand` rows may still carry those kinds; they describe a past request,
not a working control.

There is also no parked mode. The parked-impact setting has been retired from
Settings and no code reads it; an impact while parked goes through the same
filter, countdown and alert path as any other impact.

## State machine

```
BOOT
  └─ MONITORING
       │  impact >= threshold or tilt >= threshold
       ▼
   CANDIDATE (200 ms)
       │  vibration + (speed drop >= 15 kph or tilt)     │ otherwise
       ▼                                                  ▼
   COUNTDOWN (15 s, buzzer)                           MONITORING
       │  cancel button (50 ms debounce)                  │
       ├──────────────────────────────▶ CANCELLED ───────┘
       │  timeout
       ▼
   ALERTING
       ├─ SMS to configured phones
       ├─ HTTP incident to the dashboard
       ├─ retry every 60 s (configurable)
       └─ stay in ALERTING until ACK_INCIDENT; after 10 min a slower reminder beep, never silence
```

The server records a `SUSPECTED` incident at confirmation and upgrades it to
`CONFIRMED` when the countdown expires. If the driver cancels, the same incident
becomes `CANCELLED`; the dashboard shows the false alarm instead of hiding it.

## False-positive matrix

| Pattern | Evidence | Decision |
| --- | --- | --- |
| Pothole | One acceleration spike < 200 ms, no vibration, no speed drop | Reject |
| Door slam at rest | Impact, no vibration, no tilt, speed ≈ 0 | Reject |
| Harsh braking | Sustained 0.3–0.8 g, no vibration | Reject |
| Speed bump | Short spike, vibration may appear once, no tilt or real speed drop | Reject |
| Rollover | Tilt ≥ threshold for ≥ 1 s | Confirm |
| Crash | Impact + vibration + (speed drop ≥ 15 kph or tilt) | Confirm |

These rules are a starting point, not a validated detector. Tune the thresholds
against real driving data and record the false-positive rate. The native tests
cover the matrix above; the vehicle bench test is what proves it.

## Cancel window

- The buzzer starts immediately at confirmation, so the driver knows the system
  is about to act.
- The button must stay LOW for 50 ms after debounce; a switching spike is
  rejected.
- Cancel is only accepted during `COUNTDOWN`. A press after the alert starts does
  not stop the SMS; the dashboard can still mark the incident a false alarm.
- The cancel is sent to the backend as an event, not treated as "nothing
  happened".

## Acknowledgement latch

`ALERTING` has no timed exit. The device stays in that state, with a solid LED
and an audible buzzer, until the portal acknowledges the active incident or the
unit loses power.

After ten minutes the buzzer changes from the long beep (2 s on / 1 s off) to a
slower reminder (1 s on / 5 s off). The LED stays solid. The change is a
comfort decision, not a safety timeout: the alarm never goes silent on a timer.

The acknowledgement command carries the device client incident id:

```json
{
  "kind": "ACK_INCIDENT",
  "payload": { "incident_id": "llk-1a2b3c4d-00001234" }
}
```

- The id is the `llk-...` value the device generated and sent as `incident_id`.
  It is not the server `ImpactEvent.id`.
- A matching id while `Alerting` stops the buzzer, clears the active incident,
  returns the device to `Idle`, and ACKs with `{ "detail": "acknowledged" }`.
- A different or missing id, an acknowledgement during the countdown, or one
  with no active incident changes nothing and ACKs with
  `{ "detail": "unknown_incident" }`. An acknowledgement can never suppress a
  countdown that has not expired.
- `CANCEL_ALERT` keeps its existing behavior for the false-alarm path. The
  driver button remains the only way to stop the countdown locally.
- SMS and HTTP retries continue on `sos_retry_s` until the acknowledgement, so
  an unattended unit keeps using the SIM. That is deliberate: a missed alert is
  worse than the cost.
- A reboot or power loss ends the latch. The unit boots to `Idle` and the
  incident must be resolved from the portal.

### Portal recovery when the tracker cannot confirm

The portal requires a tracker acknowledgement before a dispatched incident can
be resolved. If the acknowledgement command expired or failed, or the tracker
answered `unknown_incident` or `unconfirmed`, an ADMIN may use **Resolve without
tracker confirmation** on the incident detail page. This includes a tracker
that rebooted or lost power: the unit boots to `Idle`, no longer knows the
incident, and answers `unknown_incident`. The path is deliberately narrow:

- only an ADMIN sees it, and only for a device-backed `CONFIRMED` incident;
- it is not offered while a fresh acknowledgement command is still pending;
- the UI requires typing `RESOLVE`, and the server verifies the same field;
- the action audits `incident.resolved_unconfirmed` with the actor, the
  acknowledgement state, and the last command state, sets `RESOLVED`, and
  clears the pending acknowledgement.

This recovery does **not** stop the device. The alarm may keep sounding until
the unit is powered off or the tracker acknowledges. That is the same
power-loss limit described above: the portal can close its record, but it cannot
silence a tracker it cannot reach. After a reboot the alarm is already silent,
but the portal cannot prove that from the record, so the warning still applies.

The pure latch/ack decision is covered by native tests. The physical bench run
(synthetic impact, wait past the countdown, ACK, silence) is issue #54 and stays
a human task; no flashing or hardware result is claimed here.

## Alert channels

| Channel | When | Failure behavior |
| --- | --- | --- |
| SMS (A7670E) | Countdown expires | Retry every `sos_retry_s`; works without the backend |
| HTTP incident | At confirmation and on every retry | Idempotent by incident id; a retry never duplicates |
| Dashboard | When the incident reaches the server | The responder sees the evidence and the alert trail |

The SMS body is short and ASCII:

```
LIFELINK SOS ABC 1234 10.31570,123.88540 fix 3s 45kph 11/18/26, 12:00 PM. Call +639171234567.
```

`fix 3s` is the age of the GPS fix, not a claim that the position is exact. A
stale fix is still sent.

## Power loss

- The 18650 shield keeps the tracker alive when the vehicle 12 V is cut.
- The firmware classifies power as main / backup / critical from the ignition
  sense and battery voltage.
- A power loss is a device event. It is recorded on the next successful uplink;
  it does not block the SOS path.
- The modem is the largest load. The 1000 µF capacitor and a buck rated above
  the modem's peak current are mandatory.

## Reset counting and safe mode (not implemented)

The current firmware does **not** count abnormal resets and does **not** enter
safe mode. `main.ino` never calls `esp_reset_reason()` and never feeds the
`ResetHistory` helper, so a watchdog reset, a brownout and a deliberate reboot
look the same at boot.

`ResetHistory` and `alertingAllowed()` remain in `main/safety.h` as pure, tested
helpers for a future escalation. `alertingAllowed()` always returns true: it is
a policy placeholder, not an active mode. Any future safe mode must keep
monitoring and alerting, because a missed SOS is the dangerous failure.

A reset during a pending countdown is also not recovered: the unit boots to
`Idle`, and the incident must be resolved from the portal.

## Hardware watchdog

The `loop()` task is subscribed to the ESP32 task watchdog with a **120 s**
timeout and panic enabled. If the loop stops progressing, the board panics and
reboots instead of staying hung.

The timeout is larger than every bounded blocking phase in the firmware. The
longest single modem wait is 30 s (`AT+HTTPACTION`), one complete HTTP request
can spend 87 s across its steps, and a heartbeat adds a 3 s signal query before
the POST. The guard is fed at the end of each bounded phase, never inside a
wait: the top of the loop, the impact/alert pass, between the SMS and the
incident POST, the setup portal pass, the heartbeat and command poll, and each
command acknowledgement. A genuine hang stops the next feed.

A watchdog reset is a reboot, not a recovery of the alarm. The latched
`Alerting` state is lost, the unit boots to `Idle`, and the incident must be
resolved from the portal as described above. The watchdog proves the device is
alive; it does not preserve an alert across a reset.

### Bench step

The synthetic hang is a human bench step and is not run automatically:

1. Build and flash `env:esp32dev-bench`. The default build refuses the command.
2. With the tracker `Idle` and no active incident, send `TEST_WDT` and confirm
   it only prints the warning.
3. Send `TEST_WDT CONFIRM`. The loop stops resetting the watchdog.
4. After about 120 s confirm the `Task watchdog got triggered` panic and the
   reboot to the boot banner.

Never run the step during an alert. Do not treat it as verified until it runs
on a real unit.

## Privacy

- Location is personal data. Access is scoped to the organization that owns the
  vehicle.
- Telemetry and incident retention are configured per organisation in
  Settings and enforced by a scheduled cleanup that deletes rows older than
  each configured period. The cleanup writes an audit row with cutoffs and
  counts only. A stored period that is not a positive number is skipped, so
  corrupt configuration cannot delete recent data.
- The SMS contains coordinates and a callback number; only configured contacts
  receive it.
- The server never logs device tokens. The database stores only the hash.
- The demo seed refuses a non-local database unless both `SEED_DEMO=yes` and
  `SEED_ALLOW_REMOTE=yes` are set. Demo credentials must never be seeded into a
  shared or production database.

## What is verified, and what is not

Verified in this repository:

- the pure filters, state machine, retry, latch/ack, fault and power logic
  (native tests)
- the server/firmware configuration contract (Vitest + `pnpm stack:check`)
- the three-role permission model and vehicle-owner scoping (Vitest)
- the web build, typecheck, unit tests and the API envelope
- the watchdog timeout and feed placement: compiled, with a compile-time check
  that the timeout exceeds one worst-case modem phase

Not verified here:

- the A7670E AT sequence on your module revision
- SMS delivery on your carrier and SIM
- GPS cold-start time in your installation
- false-positive rate on real roads
- power behavior with the actual buck, cells and modem
- the watchdog reset on hardware, and the absence of a false reset through a
  normal alert, cancel and acknowledgement cycle (bench step above)

Do not claim those are solved until the bench checklist in
[`hardware.md`](hardware.md) passes.
