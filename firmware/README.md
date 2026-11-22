# LifeLink firmware

PlatformIO project for the ESP32 DevKit V1 (30-pin) tracker.

## Layout

```
include/
  pins.h              canonical GPIO map, mirrored in docs/wiring.md
  secrets.example.h   optional compile-time overrides; copy to secrets.h
main/
  main.ino            orchestration: sensors, UARTs, modem, buzzer
  config.h            class A envelope + class B defaults (Arduino-free)
  filters.h           impact/tilt/vibration fusion (Arduino-free)
  safety.h            countdown, cancel, retry, faults (Arduino-free)
  gps.h               fix quality (Arduino-free)
  power.h             ADC scaling and power bands (Arduino-free)
  status.h            buzzer patterns (Arduino-free)
  modem.h             SOS SMS body (Arduino-free)
  hardware.h          hw:: aliases over pins.h
test/
  test_config/        envelope and defaults
  test_filters/       pothole, crash, rollover, door slam, debounce
  test_safety/        countdown, cancel, retry, faults, power, GPS, SMS
```

The PlatformIO project root is `firmware/`, not the repository root. Run the
commands below from the repository root with `-d firmware`.

The pure headers are compiled on the host by the `native` environment. Keep them
free of Arduino includes so the tests stay fast and deterministic.

## Build and flash

```bash
python -m pip install platformio clang-format
bash scripts/verify.sh
pio run -d firmware
pio run -d firmware -t upload     # human owner only
pio device monitor -b 115200
```

The default environment is `esp32dev`. The partition table is `min_spiffs.csv`,
which leaves room for a future signed OTA slot.

## Native tests

```bash
pio test -d firmware -e native
```

The sketch needs the ESP32 core and is excluded from the native build; the tests
include the headers directly. The `native` environment needs a host C/C++
compiler (gcc/g++ on Linux, MinGW-w64 on Windows). `scripts/verify.sh` adds the
ESP32 build, static analysis and the clang-format check.

## Provisioning

There is no compile-time token. At boot the sketch prints its identity and waits
for serial commands:

```
SET_ID AA:BB:CC:DD:EE:01
SET_TOKEN tf_...
SET_PHONE1 +639171234567
SET_PHONE2 +639181234567
SET_PLATE ABC 1234
STATUS
REBOOT
```

The token is the one shown once by the console's tracker registration form. It is
stored in NVS under the `lifelink` namespace. A factory reset clears it.

The server command poll also sends `alert_phones`; the firmware caches the first
two numbers in NVS so the SMS path keeps working if the backend is unreachable.

## Configuration sync

The command poll carries a versioned `config` object. The firmware:

1. rejects a missing object (keeps the last-good copy)
2. rejects an unsupported version
3. rejects the whole object if any field is outside its envelope or a
   whole-number field is fractional
4. persists the accepted object in NVS (`cfg_json`, `cfg_rev`)
5. echoes `config_rev` in the next heartbeat

The server table lives in `apps/web/lib/firmware/config.ts`. The test
`apps/web/lib/firmware/config.test.ts` parses `config.h` and fails on drift.

## A7670E notes

The HTTP and SMS code is a **scaffold with a bench-verification requirement**:

- Confirm the PWRKEY pulse for your module revision.
- Confirm the SIM is registered and the APN is correct.
- Confirm the custom header parameter (`AT+HTTPPARA="USER_DEFINED"`) is supported.
  If your firmware uses a different key, adjust `modemHttpRequest()`.
- Confirm SMS delivery with a real handset.
- Watch the 5 V rail during transmission. The 1000 µF capacitor and a buck rated
  above the modem's peak current are mandatory.

The exact AT sequence is not universal. Treat the first bench session as part of
the integration, not as a formality.

## Safety

- The buzzer starts at confirmation, before the SMS.
- The cancel button is debounced and only accepted during the countdown.
- The SOS retries until the retry window elapses; the incident stays open.
- Safe mode never suppresses the SOS.
- A stale GPS fix is sent with its age.
- See [`../docs/safety.md`](../docs/safety.md) for the full model and the bench
  checklist.

## Known limitations

- **No persistent event queue.** A dropped cancel or incident is retried by the
  alert path, but it is not replayed after a reboot. The dashboard can still
  resolve the incident manually.
- **The AT transport is blocking.** A slow network can delay the loop. The
  watchdog and the retry ladder bound the damage, but a non-blocking state
  machine is the next step.
- **The filter is tuned on the bench, not on a large road dataset.** The
  false-positive matrix is a starting point; record real trips and tune it.
- **The A7670E custom-header parameter must be verified.** Some module revisions
  expect a different `AT+HTTPPARA` key for request headers.
