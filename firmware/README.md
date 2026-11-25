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
  display.h           optional SSD1306 driver (I2C 0x3C)
  display_format.h    screen text, clock line, IPv4, state labels (Arduino-free)
  rtc.h               DS3231 clock at 0x68 on the shared I2C bus
  rtc_format.h        clock window and "HH:MM:SS" text (Arduino-free)
  status.h            buzzer patterns (Arduino-free)
  modem.h             SOS SMS body (Arduino-free)
  hardware.h          hw:: aliases over pins.h
test/
  test_config/        envelope and defaults
  test_config_apply/  validation and apply rules
  test_display/       screen text, clock line, IPv4, state labels, refresh gate
  test_filters/       pothole, crash, rollover, door slam, debounce
  test_provisioning/  AP name, form/NVS limits, boot reset gesture
  test_rtc/           clock window and "HH:MM:SS" formatting
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

## Incident timing

The incident payload carries two device times:

- `detected_at` is the impact detection. It is taken at the impact confirmation,
  before the countdown, from the best available clock: the battery-backed DS3231
  first, the GPS fix second, `0` when neither knows the time. The RTC value is
  already UTC epoch seconds and survives power loss, so a unit with a fitted
  clock reports the real impact time even with no GPS fix. `0` means unknown and
  the console falls back to its receipt time for the row.
- `sent_at` is the countdown expiry, the moment the emergency alert starts. It
  is derived from the countdown deadline, not from the loop pass that notices
  the expiry, so a blocking modem phase cannot add its delay. The value is
  captured once per incident; every retry reports the original. Without a GPS
  fix the payload omits it instead of sending a fabricated time.

The console measures transmission time from this alert start to the receipt of
the first `CONFIRMED` report (`ImpactEvent.confirmedReceivedAt`), and the SMS
attempts run before the incident HTTP post, so they are included in the
interval. The thesis measurement therefore needs a GPS fix at dispatch. Without
one there is no `sent_at` and the console shows no delay.

## Native tests

```bash
pio test -d firmware -e native
```

The sketch needs the ESP32 core and is excluded from the native build; the tests
include the headers directly. The `native` environment needs a host C/C++
compiler (gcc/g++ on Linux, MinGW-w64 on Windows). `scripts/verify.sh` adds the
ESP32 build, static analysis and the clang-format check.

## Hardware watchdog

The Arduino `loop()` task is subscribed to the ESP32 task watchdog
(`esp_task_wdt`) with a **120 s** timeout and panic enabled. A loop that stops
progressing panics and reboots the board instead of staying hung.

The timeout is sized from the blocking A7670E transport, which is the longest
bounded work in the sketch:

| Bound | Time |
| --- | --- |
| longest single AT wait (`AT+HTTPACTION`) | 30 s |
| one complete `modemHttpRequest()` (every step at its timeout) | 87 s |
| heartbeat or `LOCATE` (3 s `AT+CSQ` plus the POST) | 90 s |
| watchdog timeout | 120 s, 30 s above the largest phase |

The GPS read drains the UART without waiting, so it adds no bounded wait. The
watchdog starts near the top of `setup()`, before NVS and modem bring-up, so a
hung boot also reboots. The longest boot step is the ~11 s modem PWRKEY
sequence, still well below the timeout.

Feeds mark the end of a bounded phase, never a point inside a wait:

- the start of `loop()`, which proves the previous iteration returned;
- after the impact/alert pass, including a driver cancel or all-clear SMS;
- between the two SMS and the incident POST in the alert path;
- after one setup-portal or stored-WiFi pass;
- after the heartbeat and after the command poll, and per command, because
  each acknowledgement is a separate request.

A real hang stops the next feed, so the panic fires within 120 s.

A watchdog reset is a full reboot. It ends a latched `Alerting` alarm exactly
like a power loss: the unit boots to `Idle`, and the portal must resolve the
incident.

### Bench step (human, not automated)

The check never runs automatically and must not run during an alert. Build the
bench environment, the only build that compiles the blocking command:

```bash
pio run -d firmware -e esp32dev-bench -t upload   # human owner only
pio device monitor -b 115200
```

Build immediately before the bench flash. The `.pio` build directory can hold a
`firmware.bin` from an earlier source revision; do not flash a cached copy. The
`-t upload` target above rebuilds first.

With the tracker `Idle` and no active incident:

1. Send `TEST_WDT`. The device prints the warning and asks for confirmation; it
   does not block.
2. Send `TEST_WDT CONFIRM`. The loop stops resetting the watchdog.
3. After about 120 s the serial log shows the task watchdog panic
   (`Task watchdog got triggered`) and the board reboots to the normal boot
   banner.
4. The default `esp32dev` build refuses the command with
   `[TEST] TEST_WDT is not built into this firmware`.

Do not treat this as verified until it runs on a real unit. The bench
environment is not part of the CI matrix, so rebuild it when the serial handler
or the watchdog code changes.

## Provisioning

The primary setup path is the device-hosted WiFi portal. Serial provisioning is
kept for bench work and debugging.

### Build-time identity (Wi-Fi-only provisioning)

Register the tracker in the dashboard, then put its ID and the one-time token in
`firmware/include/secrets.h` (gitignored; copy `secrets.example.h`):

```c
#define LIFELINK_DEVICE_ID "34:84:A9:7B:8A:C8"
#define LIFELINK_DEVICE_TOKEN "llk_..."
#define LIFELINK_API_BASE "https://your-console.example.com"
```

With a valid token compiled in, the setup portal asks **only for the WiFi name
and password**. The dashboard remains the source of truth for the calibration
thresholds and alert phones: the command poll carries them and the firmware
applies them automatically. The serial `SET_ID` / `SET_TOKEN` commands still
work and take precedence; a factory reset falls back to the build identity.

The token is not written to NVS when it comes from the build, so flashing a new
build with a different token, or sending `SET_TOKEN`, replaces it. The token is
inside the firmware binary: protect the artifact as you would the device.

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
- Page: async 2.4 GHz scan, manual SSID and password. The Device ID and Device
  Token fields appear only when no build identity is present; with a compiled
  token the page shows the preloaded ID and asks for Wi-Fi only.
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
| `device_token` | dashboard device token; absent when the build supplies it |
| `device_uuid` | optional UUID; nothing writes it today, shown only when present |
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
- hold 10 s: clears WiFi, `device_id`, `device_token`, `device_uuid` and
  `provisioned`, then reboots. A build-supplied identity is seeded again on the
  next boot; clear it by flashing a build without it.

The reset is disabled permanently if the alert state machine leaves `Idle`, so
a long press during a countdown or SOS cannot reboot the tracker. A 5 s hold is
deliberately not a reboot at 5 s: releasing there restarts, while continuing to
10 s reaches the factory clear.

### Serial provisioning

Serial commands remain available for bench work:

```
SET_ID AA:BB:CC:DD:EE:01
SET_TOKEN llk_...
SET_PHONE1 +639171234567
SET_PHONE2 +639181234567
SET_PLATE ABC 1234
STATUS
TIME
SET_TIME 1767225600
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

## Real-time clock (DS3231)

The impact time is captured at the trigger, not when the SMS leaves. A phone's
timestamp is receipt time, and a cold GPS fix indoors can take minutes, so the
tracker carries its own battery-backed clock.

- **Bus and address:** DS3231 at `0x68` on the shared I2C bus (SDA 21, SCL 22),
  VCC 3V3, GND. The MPU-6050 moved to `0x69` by tying AD0 to 3V3, so the RTC can
  own `0x68`; the SSD1306 stays at `0x3C`. No ESP32 pin was added.
- **Backup:** a CR2032 keeps the clock and the oscillator running with the
  tracker unpowered. It lasts for years at room temperature; the exact life
  depends on the cell and the temperature, so treat any figure as an estimate.
- **Drift:** ±2 ppm from 0 to +40 °C (about a minute a year), ±3.5 ppm over the
  full −40 to +85 °C range. The firmware corrects the RTC from GPS when the two
  differ by more than 5 s, at most once an hour and only while `Idle`, so a
  correction never lands in a countdown or an SOS.
- **Timestamp at trigger:** at the impact confirmation the firmware stores
  `bestEpochSeconds()` — the RTC first, the GPS fix second, `0` when neither
  knows the time — and every incident payload for that incident reports it as
  `detected_at`, including retries. `sent_at` is the countdown expiry and stays
  GPS-derived.
- **Missing RTC:** `begin()` probes `0x68` once. When nothing answers, the log
  says `[RTC] no DS3231 - continuing without it`, every read returns `0`, and
  the timestamp falls back to GPS. The IMU, panel, countdown and SOS path are
  unchanged.
- **Coin cell:** after a replacement or a flat cell the log says
  `[RTC] lost power - set the time with SET_TIME <epoch> or wait for GPS`. The
  module reads 2000-01-01 until it is set, which the firmware treats as unknown.
  The first valid GPS fix also corrects it.

### Serial commands

```
TIME
SET_TIME 1767225600
```

- `TIME` prints both clocks and which one is in use:

  ```
  [TIME] rtc=1767225600 (00:00:00) gps=0 (--:--:--) source=rtc present=yes lost_power=no
  ```

  `source` is `rtc`, `gps` or `none`; `--:--:--` means that clock is unknown.
- `SET_TIME <epoch>` writes a UTC Unix epoch to the DS3231. The value must be
  inside 2024-2099, otherwise the command is rejected:
  `[TIME] SET_TIME rejected: expected a Unix epoch for 2024-2099`. With no
  module fitted it fails with `[TIME] SET_TIME failed: no DS3231 at 0x68`.
- Both are UTC. The console and phone render local time; the device never
  converts.

### Bench verification (human, issue #54)

Not verified until it runs on a real unit. Minimum: boot with the module fitted
and confirm `[RTC] DS3231 ready at 0x68` and `source=rtc`; remove all power,
restore it, and confirm the time survived; trigger an incident and confirm
`detected_at` matches the impact, not the SMS; unplug the module and confirm the
tracker still dispatches with the GPS fallback. The full list is in
[`../docs/hardware.md`](../docs/hardware.md), items 26-31.

## Status display (SSD1306)

The production firmware drives an optional 128x64 SSD1306 panel on the shared
I2C bus. It is a commissioning and bench aid, not a safety indicator.

| Signal | Connection |
| --- | --- |
| VCC | 3V3 (the panel is a 3.3 V part; do not use the 5 V rail) |
| GND | GND |
| SDA | GPIO 21, shared with the MPU-6050 and the DS3231 |
| SCL | GPIO 22, shared with the MPU-6050 and the DS3231 |
| RES | not connected; the driver initialises with `reset=false` |
| Address | `0x3C` |

The driver is fixed at `0x3C` and 128x64. A module strapped to `0x3D`, or a
different panel size, needs `fw::kDisplayAddress`/`kDisplayWidth`/`kDisplayHeight`
in `main/display.h` changed and a rebuild. Do not power the panel from 5 V.

### Screens

| Screen | When | Content |
| --- | --- | --- |
| `PROVISIONING` | the setup AP is open | `WiFi setup`, `Join network:`, the `LifeLink-XXXX` AP name, `Open 192.168.4.1` |
| `JOINING` | a stored-network check or a portal join is in progress | the SSID, `Working` with progress dots, and `Try n of 3` for the stored check |
| `WIFI OK` | about 3 s after a verified portal save | `WiFi OK - saved`, the SSID, the IP, `Uplink: 4G modem` |
| Home | every other time | `WiFi: setup` / `WiFi: joining` / `WiFi: joined`, the device ID (`g_deviceId`), an optional UUID, `Uplink: 4G modem`, and `Time HH:MM:SS` when the clock is known |
| `IMPACT ALERT` | once, at the impact confirmation | `IMPACT ALERT`, `Time HH:MM:SS` (or `Time unknown`), `Do not power off` |

**"Joined" means joined to WiFi, not online.** The WiFi radio is
commissioning-only: telemetry, commands and SOS stay on the A7670E. The home and
success screens say `Uplink: 4G modem` so the display cannot be read as a
network-status indicator. The home screen keeps the last proven result; the
radio is switched off after commissioning, so `WiFi: joined` is a
commissioning result, not a live association.

The device token is never displayed. `display_format.h` has no token input at
all; the home screen receives only the WiFi state, `g_deviceId`, an optional
UUID and the clock epoch.

The UUID line is shown only when one already exists. The firmware reads the
optional NVS key `device_uuid` and never derives or invents one. Nothing writes
that key today, so the line is normally absent. A UUID longer than 21 characters
is truncated on the panel; the full value stays in NVS.

The clock line is `Time HH:MM:SS` (UTC), appended last on the home screen. It is
present only when the RTC or the GPS knows the time; a unit with neither omits
the line, so the identity block never moves. With a UUID and a clock the home
screen uses all 8 rows of the panel; a new line would have to replace one.

Screen text is sanitised to printable ASCII: control bytes and anything above
0x7E render as `?`, so a UTF-8 SSID cannot produce a broken glyph or split a
multi-byte sequence.

The build pins Adafruit SSD1306 2.5.17, Adafruit GFX 1.13.0 and Adafruit BusIO
1.17.4 in `platformio.ini`. They are not used by the native test environment.

### Non-blocking behaviour

- `begin()` probes `0x3C` once. A missing panel, or a failed init, disables the
  display and the tracker runs exactly as before. The serial log says
  `[OLED] no SSD1306 at 0x3C - continuing without a display`.
- The driver redraws only when the rendered text changes, at most once per
  250 ms. A full 1024-byte frame at 400 kHz takes about 25 ms.
- The caller skips the display entirely while the alert state is not `Idle`, so
  no I2C traffic can sit inside a countdown or an SOS. The single exception is
  the impact frame: it is forced once with `showNow()` at the confirmation, at
  the start of the countdown, and then frozen until the tracker returns to
  `Idle`. The force is needed because the home clock changes every second, so
  the last home frame can be inside the 250 ms gap; `show()` would drop the only
  impact frame the alert path ever requests.
- The display is serviced after the buzzer is written and before the blocking
  modem block. There are no `delay()` calls in the display path.
- The library switches the bus to 400 kHz for its own transfers and restores
  100 kHz afterwards, so the MPU-6050 stays at 100 kHz. Both rates come from the
  driver's constructor (`kDisplayI2cClockHz`, `kDisplayIdleClockHz`). If a long
  bus or a slow module proves unreliable, lower `kDisplayI2cClockHz` and expect
  a longer flush (about 100 ms at 100 kHz).

The pure layout and refresh gate live in `main/display_format.h` and are
covered by `test/test_display`, so the screen text, the clock line, IPv4
formatting, AP name, state labels and redraw rule are testable without a panel.
Hardware checks are in [`../docs/hardware.md`](../docs/hardware.md); they are
not a bench claim.

### Bench checks (human)

The full list is in [`../docs/hardware.md`](../docs/hardware.md), items 18-24 for
the display and 26-31 for the RTC. The minimum is: boot with the panel connected
and confirm the home screen and its clock line; boot with it unplugged and
confirm the firmware still joins and reports; run a portal join and confirm
`JOINING`, then `WIFI OK`, then home; trigger an impact and confirm the impact
screen appears once and then stays frozen. None of this is a bench claim until
it runs on a real unit.

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
- Safe mode is not implemented. If reset escalation is added later, it must never
  suppress the SOS.
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
  120 s watchdog and the retry ladder bound the damage, but a non-blocking state
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
- **The status display is not a safety indicator.** It freezes on the impact
  screen while the alert state is not `Idle`, and the firmware never reads it
  back. A panel that fails after boot can add a bounded I2C wait to the loop; the
  alert state machine and the modem path do not depend on it.
- **The RTC is a convenience, not a guarantee.** Drift is about a minute a year
  and a flat or missing CR2032 loses the clock until the next GPS fix or
  `SET_TIME`. Everything is UTC with no timezone conversion, and the device never
  invents a time: `detected_at` is `0` and the impact screen says `Time unknown`
  when neither clock is set.
- **The display shares the I2C bus with the IMU and the RTC.** A wiring fault on
  one device can affect the others. The panel is optional: boot with it
  disconnected to isolate an I2C problem.
