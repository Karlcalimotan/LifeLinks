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
  provisioning.h      WiFi AP name, form/NVS rules, boot reset (Arduino-free)
  status.h            buzzer patterns (Arduino-free)
  modem.h             SOS SMS body (Arduino-free)
  hardware.h          hw:: aliases over pins.h
test/
  test_config/        envelope and defaults
  test_filters/       pothole, crash, rollover, door slam, debounce
  test_provisioning/  AP name, form/NVS limits, boot reset gesture
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

The primary setup path is the device-hosted WiFi portal. Serial provisioning is
kept for bench work and debugging.

### WiFi commissioning portal

WiFi is **commissioning-only**: the A7670E remains the telemetry, command and
SOS uplink. The radio is used to prove a network and collect the device
identity, then it is switched off. Do not expect heartbeats or OTA over WiFi.

At boot the firmware:

1. treats the unit as provisioned only when NVS holds `provisioned`, a usable
   `wifi_ssid`/`wifi_pass`, and a usable `device_id`/`device_token`;
2. if provisioned, checks the stored network up to three times (20 s each, with
   a 6 s quick-fail for "no such network", "password refused" and "link lost");
3. opens the setup portal if the unit is not provisioned or all three joins
   fail;
4. if a join succeeds, turns the radio off and continues normal operation.

Portal:

- AP name: `LifeLink-` plus the last four hex digits of the eFuse MAC,
  uppercase and zero padded (for example `LifeLink-EEFF`).
- Address: `http://192.168.4.1` (open AP; DNS catch-all for captive-portal
  detection).
- Page: async 2.4 GHz scan, manual SSID, password, Device ID prefilled with the
  unit MAC, and Device Token.
- Test-before-save: the entered network must connect and obtain an IP within
  20 s (6 s quick-fail). Only then are `wifi_ssid`, `wifi_pass`, `device_id`,
  `device_token` and `provisioned` written. A wrong password never replaces
  working credentials; the portal stays open with a human-readable reason.
- Secrets: the password and token are never rendered back into the page or a
  JSON response and are never logged. SSIDs are HTML-escaped. The AP is open,
  so treat physical proximity as the security boundary.
- Lifecycle: the portal closes about 2 s after a verified save (long enough for
  the status page to render), or after 10 minutes. Both paths stop the DNS
  server, HTTP server and radio and return to normal operation.

NVS namespace `lifelink`:

| Key | Meaning |
| --- | --- |
| `wifi_ssid` | provisioned network |
| `wifi_pass` | WPA/WPA2 passphrase, empty for an open network |
| `device_id` | dashboard device id (the unit MAC by default) |
| `device_token` | dashboard device token |
| `provisioned` | marker written only after a verified portal save |

### Boot reset (GPIO 33)

The existing cancel button is also the commissioning reset. It accepts a new
hold only during the first 60 seconds after boot (a hold that started inside the
window may finish after it):

- power on with the button **released**; the listener arms 5 s after boot and
  requires a 50 ms debounce;
- a button held from power-on (stuck) never arms, so a shorted button cannot
  erase anything;
- hold 5 s: clears WiFi only and reboots on release, keeping the identity;
- hold 10 s: clears WiFi, `device_id`, `device_token` and `provisioned`, then
  reboots.

The reset is disabled permanently if the alert state machine leaves `Idle`, so
a long press during a countdown or SOS cannot reboot the tracker. A 5 s hold is
deliberately not a reboot at 5 s: releasing there restarts, while continuing to
10 s reaches the factory clear.

### Serial provisioning

Serial commands remain available for bench work:

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

A unit provisioned only over serial has no stored WiFi network, so the portal
opens on its next boot until it is provisioned through the portal. The serial
token still feeds the modem path in the current boot; the portal can keep it by
leaving the Device Token field blank.

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
  machine is the next step. A blocking heartbeat can also delay a portal
  response, but the join itself continues in the WiFi stack.
- **The filter is tuned on the bench, not on a large road dataset.** The
  false-positive matrix is a starting point; record real trips and tune it.
- **The A7670E custom-header parameter must be verified.** Some module revisions
  expect a different `AT+HTTPPARA` key for request headers.
- **WiFi is commissioning-only.** There is no telemetry, OTA or fallback uplink
  over WiFi yet. Turning WiFi on while the modem is transmitting must be
  checked on the 5 V rail (see `docs/hardware.md`).
- **The setup AP is open.** The page never displays a stored token or password,
  but anyone in radio range can load it while it is open. The 10-minute
  lifetime and physical control of the unit are the mitigations; a per-unit AP
  password is future work.
