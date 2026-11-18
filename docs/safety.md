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
       └─ stop retrying after 10 min; the incident stays open
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

## Alert channels

| Channel | When | Failure behavior |
| --- | --- | --- |
| SMS (A7670E) | Countdown expires | Retry every `sos_retry_s`; works without the backend |
| HTTP incident | At confirmation and on every retry | Idempotent by incident id; a retry never duplicates |
| Dashboard | When the incident reaches the server | The operator sees the evidence and the alert trail |

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

## Safe mode

After three abnormal resets in ten minutes the device enters safe mode. It stops
non-essential work (OTA, periodic polling) but **continues to monitor impacts and
continues to alert**. `alertingAllowed()` returns true in safe mode by design,
and a native test pins that behavior. A reset during a pending countdown is
recovered on boot: the incident id is persisted before the countdown starts.

## Privacy

- Location is personal data. Access is scoped to the organization that owns the
  vehicle.
- Telemetry and incident retention are configurable in Settings.
- The SMS contains coordinates and a callback number; only configured contacts
  receive it.
- The server never logs device tokens. The database stores only the hash.
- The demo seed refuses a non-local database unless `SEED_DEMO=yes` is set.

## What is verified, and what is not

Verified in this repository:

- the pure filters, state machine, retry, fault and power logic (native tests)
- the server/firmware configuration contract (Vitest + `pnpm stack:check`)
- the web build, typecheck, unit tests and the API envelope

Not verified here:

- the A7670E AT sequence on your module revision
- SMS delivery on your carrier and SIM
- GPS cold-start time in your installation
- false-positive rate on real roads
- power behavior with the actual buck, cells and modem

Do not claim those are solved until the bench checklist in
[`hardware.md`](hardware.md) passes.
