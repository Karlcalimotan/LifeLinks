# ADR-0002: Fail open for alerting

## Status

Accepted, 2026-11-18.

## Context

An actuator system usually fails safe by refusing to act. A vehicle crash alert
is the opposite: refusing to act is the dangerous direction. A missed SOS can
cost a life; a false alarm costs a phone call and some trust.

At the same time, a system that cries wolf is ignored. The design needs a way to
be decisive without being naive.

## Decision

1. Detection uses **impact + vibration + (speed drop or sustained tilt)**, not a
   single sensor. A rollover is confirmed by tilt alone after one second.
2. A confirmed impact starts a **visible countdown** with a buzzer. The driver
   can cancel inside the window.
3. When the window expires, the device sends an **SMS** and an HTTP incident. It
   keeps retrying until the retry window elapses.
4. **Safe mode never blocks alerting.** After repeated resets, non-essential work
   stops, but impact detection and the SOS path stay active.
5. A stale GPS fix is sent with its age; it never blocks the SOS.
6. The backend records a `SUSPECTED` incident immediately and upgrades it to
   `CONFIRMED` after the countdown, so the console sees the event even if the
   driver cancels.

## Consequences

- The false-positive matrix must be tuned on real roads.
- The cancel button and the buzzer are safety components, not cosmetics.
- The dashboard must show cancelled incidents; hiding them would make the system
  look more reliable than it is.
- Bench tests are mandatory. The native tests prove the logic, not the vehicle.
