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
  test_safety/        countdown, cancel, retry, latch/ack, faults, power, GPS, SMS
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

### Boot reset (GPIO 13 / GPIO 14)

Two dedicated boot-time buttons replace the old cancel-button gesture. They
accept a new hold only during the first 60 seconds after boot (a hold that
started inside the window may finish after it):

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

## Acknowledgement latch (`ACK_INCIDENT`)

A dispatched incident is latched. The device stays in `Alerting` until the
portal acknowledges that incident; there is no timed silence.

Command from the server:

```json
{
  "kind": "ACK_INCIDENT",
  "payload": { "incident_id": "llk-1a2b3c4d-00001234" }
}
```

- `payload.incident_id` is the **device client incident id** (`llk-...`, the
  value the device generated and sent as `incident_id`). It is compared with the
  device's own active id, not with the server `ImpactEvent.id`.
- Matching id while `Alerting`: the buzzer stops, the ACK carries
  `{ "detail": "acknowledged" }`, the active incident is cleared, and the device
  returns to `Idle`.
- Different or missing id, a countdown that has not expired, or no active
  incident: the ACK carries `{ "detail": "unknown_incident" }` and the current
  state is unchanged. An acknowledgement can never suppress a countdown.
- `CANCEL_ALERT` is unchanged and still works for the false-alarm path.
- The LED is solid for the whole of `Alerting`. The buzzer uses a long beep
  (2 s on / 1 s off) for the first 10 minutes, then a slower reminder
  (1 s on / 5 s off). It never goes silent on a timer.
- SMS and HTTP retries continue on the configured `sos_retry_s` interval until
  the acknowledgement arrives. Budget for that when a unit is left alerting.

The pure decision lives in `main/safety.h` (`acknowledgeIncident`,
`incidentIdsMatch`) and `main/status.h` (`alertingPattern`) and is covered by
`test_safety`.

### Bench steps (human, issue #54)

Do not treat these as done until they run on a real unit with a test SIM.

1. Trigger a synthetic impact and let the countdown expire.
2. Confirm the LED is solid, the buzzer is the 2 s / 1 s long beep, and the
   incident appears on the portal.
3. Wait past 10 minutes. Confirm the buzzer changes to 1 s / 5 s, never goes
   silent, and `STATUS` still reports `Alerting`.
4. Send `ACK_INCIDENT` with the `llk-...` id from the portal. Confirm the buzzer
   stops, the LED goes off, the ACK detail is `acknowledged`, and the portal
   records the acknowledgement.
5. Send a second `ACK_INCIDENT` with a wrong or empty id while alerting. Confirm
   `unknown_incident` and that the alarm continues.
6. Send `CANCEL_ALERT` and confirm the existing cancel and all-clear path still
   works.
7. Power-cycle during `Alerting`. The unit boots to `Idle`; the alarm does not
   resume and the portal must resolve the incident manually. Record that
   behavior as the accepted power-loss limit.

## Configuration sync

The command poll carries a versioned `config` object. The firmware:

1. rejects a missing object (keeps the last-good copy)
2. rejects an unsupported version
3. rejects the whole object if any field is outside its envelope or a
   whole-number field is fractional
4. validates at **queue** time, then applies only while the alert state is
   `Idle`; a config that arrives mid-countdown waits instead of changing the
   window under an active alert
5. persists the accepted object in NVS (`cfg_json`, `cfg_rev`) only after it is
   applied
6. echoes the applied `config_rev` in the next heartbeat; a rejected or queued
   object does not move the rev
7. falls back to the factory defaults on boot when the stored object is
   missing, unparsable or out of envelope

Serial controls for bench work:

```
CONFIG                 # print the active config JSON and whether one is queued
SET_CONFIG <json>      # validate and queue a payload
RESET_CONFIG           # clear NVS and return to factory defaults
```

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
- `Alerting` is latched until `ACK_INCIDENT` for the active incident; there is
  no timed silence. After 10 minutes the buzzer slows to a reminder pattern and
  the LED stays solid.
- `CANCEL_ALERT` and the driver-cancel path are unchanged.
- Safe mode never suppresses the SOS.
- A stale GPS fix is sent with its age.
- See [`../docs/safety.md`](../docs/safety.md) for the full model and the bench
  checklist.

## Known limitations

- **No persistent event queue.** A dropped cancel or incident is retried by the
  alert path, but it is not replayed after a reboot. A reboot or power loss also
  ends the latched alarm; the unit boots to `Idle` and the portal must resolve
  the incident manually.
- **SMS cost while latched.** The retry ladder runs until the acknowledgement
  arrives, so an unacknowledged unit keeps sending on the configured interval.
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
