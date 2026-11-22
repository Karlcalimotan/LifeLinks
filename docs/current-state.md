# Current state

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
| `firmware/main/status.h` | Buzzer patterns (Arduino-free) |
| `firmware/main/modem.h` | Bounded ASCII SOS body (Arduino-free) |
| `firmware/main/hardware.h` | `hw::` aliases over the canonical pin map |
| `firmware/include/pins.h` | Canonical GPIO map (added by the setup) |
| `firmware/test/` | 23 native Unity tests across config, filters and safety |

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
  `SET_PLATE`, `STATUS`, `REBOOT`).
- Server-side contract drift test parses `firmware/main/config.h`.

## Existing CI

`.github/workflows/ci.yml` runs:

- web: `pnpm stack:check`, lint, typecheck, tests and build;
- firmware: native tests and the ESP32 build.

## Gaps against the agent setup guide

These are inputs for the Phase 1 audit, not changes made by the setup:

1. **Watchdog is not enabled.** No `esp_task_wdt` use; a hung modem call is not
   recovered by a reset.
2. **The modem/GPS path still blocks.** `main.ino` has bounded waits, but several
   AT calls block the loop for seconds; `delay()` is used inside the transport
   and during PWRKEY power-on.
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
