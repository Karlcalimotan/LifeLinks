# Hardware

Board: **ESP32 DevKit V1 (30-pin, DOIT layout)**. Check the silkscreen on your
board; clones differ.

The canonical pin map, power chain and pre-power checklist live in
[`wiring.md`](wiring.md). The code source of truth is
[`firmware/include/pins.h`](../firmware/include/pins.h). Do not duplicate pin
numbers here.

The GPS and modem UARTs are **remapped** UART1/UART2, not the USB serial pins.
GPIO 1/3 stay free for the USB monitor.

## Sensor notes

- **MPU-6050**: mount rigidly to the vehicle chassis, not to a loose trim panel.
  The sketch reads acceleration magnitude and tilt relative to gravity. The
  gyro is available but the first version confirms on acceleration + tilt +
  vibration, not on integration.
- **SW-420**: the common module's DO is LOW when vibration is detected. Verify
  the polarity on your module with a meter; change the comparison in
  `main.ino` if your board is inverted.
- **NEO-6M**: cold start can take minutes. The firmware never blocks the SOS on
  a fresh fix; it sends the last known position with `gps_fix_age_s`. Give the
  antenna a clear view of the sky.
- **A7670E**: 3.3 V logic, 5 V supply. Do not power it from the ESP32 3.3 V
  regulator. Confirm the SIM is seated, the APN is correct and the module is
  registered before relying on SMS. PWRKEY is active LOW: the sketch probes `AT`
  first, then pulses the key low for 1.2 s and releases it HIGH.
- **Battery/ignition sense**: the wiring diagram does not include the dividers,
  so `hw::kHasPowerSense` is `false` and the firmware omits those fields. Fit the
  dividers first, then enable the flag in `firmware/main/hardware.h`.

## WiFi commissioning and the reset gesture

The ESP32's 2.4 GHz radio is **commissioning-only**; the A7670E remains the
telemetry, command and SOS uplink. The firmware starts a setup access point only
when the unit has no verified provisioned network, or when three consecutive
joins of the stored network fail. The AP is named `LifeLink-` plus the last four
hex digits of the eFuse MAC (uppercase, zero padded, for example
`LifeLink-EEFF`). Join it and open `http://192.168.4.1`; the DNS catch-all also
opens the page from a captive-portal prompt.

The page scans 2.4 GHz networks asynchronously and also accepts a manual SSID.
It tests the submitted network for up to 20 s (6 s quick-fail) and writes NVS
only after the station has an IP. A wrong password leaves the stored credentials
alone and the portal stays open with the reason. The portal closes about 2 s
after a verified save or after 10 minutes, then the radio is switched off.

Two dedicated boot-time buttons replace the old cancel-button gesture, both
`INPUT_PULLUP` and active LOW:

- **GPIO 13 - WiFi reset:** hold 5 s to clear the stored WiFi credentials and
  reboot. Identity is kept.
- **GPIO 14 - factory reset:** hold 10 s to clear WiFi, identity and the
  `provisioned` marker.

The cancel button on GPIO 33 stays dedicated to the alert.

| Gesture | Result |
| --- | --- |
| power on with the button released, wait 5 s | listener arms (50 ms debounce) |
| hold 5 s | clears WiFi, keeps device identity; reboots on release |
| hold 10 s | clears WiFi, `device_id`, `device_token`, `device_uuid`, `provisioned`; reboots |
| button held from power-on | no reset (stuck-button guard) |
| any alert leaves `Idle` | reset is disabled for the rest of the boot |

The listener accepts a new hold only in the first 60 s after boot; a hold that
started inside the window may finish after it. The 5 s grace and the
clean-release requirement are deliberate: a shorted or stuck button must never
erase a working unit. A 5 s hold does not reboot immediately, so continuing to
10 s can still reach the factory clear.

WiFi does not change the A7670E wiring, the SOS path or the alert state machine.
The modem is still the only uplink.

## Status display (SSD1306)

The tracker can drive an optional 128x64 SSD1306 OLED as a commissioning and
bench aid. It is not part of the safety path and the firmware never reads it
back.

- **Bus:** the shared I2C bus already used by the MPU-6050. SDA GPIO 21, SCL
  GPIO 22, VCC 3V3, GND. Do not use the 5 V rail; the panel is a 3.3 V part.
- **Address:** `0x3C`, fixed in `firmware/main/display.h`. Some modules are
  strapped to `0x3D`; use a `0x3C` module or change the constant and rebuild.
- **Reset:** no RES line is wired. The driver initialises with `reset=false`.
  If a particular module needs a reset pulse, wire RES to a spare GPIO and
  change `display.h`.
- **Clock:** the driver uses 400 kHz only for the SSD1306 library's own
  transfers and restores 100 kHz afterwards, so the MPU-6050 stays at 100 kHz.
  Lower `kDisplayI2cClockHz` if a long bus or a slow module is unreliable, and
  accept a slower frame (about 100 ms at 100 kHz).
- **Mounting:** put the panel where it can be seen during installation and
  bench work. It is not a driver-facing gauge and must not be mounted where it
  distracts the driver.

| Screen | Meaning |
| --- | --- |
| `PROVISIONING` | The setup AP is open. Join `LifeLink-XXXX` and open `192.168.4.1`. |
| `JOINING` | A stored-network check or a portal join is in progress; the SSID, progress dots and `Try n of 3` are shown. |
| `WIFI OK` | A portal join was verified and saved; the SSID and IP stay for about 3 s. |
| Home | `WiFi: setup`, `WiFi: joining` or `WiFi: joined`, the device ID, an optional UUID, and `Uplink: 4G modem`. |

`WiFi: joined` means the unit joined a WiFi network. It does **not** mean the
tracker is online: telemetry, commands and SOS stay on the A7670E. The home
screen keeps the last proven result; the radio is switched off after
commissioning, so `WiFi: joined` is a commissioning result, not a live
association. The display never shows the device token, and the UUID line appears
only when a UUID already exists (the optional NVS key `device_uuid`; nothing
writes it today). A UUID longer than 21 characters is truncated on the panel.

If the panel is absent or the I2C init fails, the firmware logs
`[OLED] no SSD1306 at 0x3C - continuing without a display` and runs normally.
The display is redrawn only when the text changes (at most every 250 ms) and is
skipped entirely while the alert state is not `Idle`.

## Bench checklist

These are **not** software-verified. Run them on the actual hardware and record
the result.

1. **Power**: set the buck to 5.0–5.1 V; connect the shield; confirm 5 V on the
   rail with the modem idle and transmitting.
2. **Brownout**: transmit an SMS while watching the 5 V rail. The ESP32 must not
   reset. If it does, check the capacitor, the buck current rating and the
   battery's discharge capability.
3. **IMU**: tilt the board slowly; the dashboard/heartbeat tilt follows. Tap the
   board; the SW-420 count increments.
4. **GPS**: cold start outdoors; confirm satellites ≥ 4 and a plausible fix.
5. **Cancel**: trigger a simulated impact; press cancel inside the window;
   confirm the buzzer stops and the dashboard shows `cancelled`.
6. **SOS**: trigger a simulated impact; do not cancel; confirm the SMS arrives
   and the dashboard shows `confirmed`.
7. **False positives**: drive over a pothole, close a door, brake hard. None
   should produce an SOS.
8. **Power cut**: remove the 12 V feed while the tracker is on backup. Confirm
   the device stays alive and can still send an SMS.
9. **Modem failure**: remove the SIM. Confirm the device does not crash and the
   fault is visible in the event log on the next successful heartbeat.
10. **Range**: repeat the SMS test at the edge of coverage; confirm the retry
    behavior.
11. **Portal boot**: factory-reset the unit (10 s hold, see above), reboot, and
    confirm the AP `LifeLink-XXXX` matches the last four hex digits of the
    eFuse MAC printed at boot. Join from a phone; confirm `192.168.4.1` loads
    and the captive-portal prompt works on both iOS and Android.
12. **Scan and manual entry**: confirm the page lists nearby 2.4 GHz networks
    with plausible signal strength, and that a manually typed SSID also works.
    The ESP32 is 2.4 GHz only; 5 GHz networks must not appear.
13. **Wrong password**: with the stored router switched off, boot until the
    portal opens (three failed joins). Submit a deliberately wrong password.
    Confirm the portal stays open with a readable reason. Switch the router back
    on and reboot; the unit must rejoin the previously stored network, proving
    the wrong password did not overwrite it.
14. **Correct password**: submit the real SSID and password. Confirm the status
    page shows the IP, the AP closes within a few seconds, and the next boot
    does not reopen the portal. Confirm the Device ID/Token stored are the ones
    the dashboard expects.
15. **Reset timing**: release after 4 s (nothing), hold 5 s and release (WiFi
    only; identity survives), hold 10 s (identity and `provisioned` also gone).
    Hold the button from power-on: nothing must be erased. Start a countdown and
    hold the button: the boot reset must be disabled and the alert must continue.
16. **Radio current**: with the portal open, watch the 5 V rail while the modem
    transmits. WiFi association and an AP scan add current spikes; the ESP32
    must not brown out.
17. **Portal lifetime**: leave the portal open without saving. Confirm it closes
    after 10 minutes and the tracker returns to normal monitoring and modem
    operation without a reboot.
18. **Display present**: boot a provisioned unit with the panel connected.
    Confirm the home screen shows the device ID that matches the boot log and
    `STATUS`, `WiFi: joined` after a successful stored join, and
    `Uplink: 4G modem`.
19. **Display absent**: unplug the panel and boot. Confirm the serial log says
    `[OLED] no SSD1306 at 0x3C - continuing without a display`, the unit still
    joins its stored network and sends a heartbeat/SMS, and there is no reset
    loop.
20. **Provisioning screen**: factory-reset the unit (10 s on GPIO 14). Confirm
    the display shows `PROVISIONING`, the `LifeLink-XXXX` AP name matching the
    last four MAC hex digits, and `Open 192.168.4.1`.
21. **Join screens**: join a network from the portal. Confirm `JOINING` shows
    the SSID and progress, `WIFI OK` shows the SSID and IP for about 3 s, then
    the home screen shows `WiFi: joined`.
22. **Wrong password**: submit a deliberately wrong password. Confirm the
    display returns to `PROVISIONING` (no `WIFI OK`) and the stored credentials
    are unchanged.
23. **Alert isolation**: trigger a countdown and let it alert with the panel
    connected. Confirm the display does not update during the countdown or the
    alert, the buzzer/cancel/ack timing is unchanged, and the display updates
    again after the acknowledgement.
24. **Shared bus**: with the panel and the MPU-6050 on the same bus, confirm the
    heartbeat still carries plausible `accel_g`/`tilt_deg` values and the panel
    does not corrupt the IMU readings.

## Bill of materials

| Part | Purpose |
| --- | --- |
| ESP32 DevKit V1 (30-pin) | Controller |
| MPU-6050 (GY-521) | Acceleration and tilt |
| SW-420 | Vibration confirmation |
| NEO-6M (GY-GPS6MV2) | Location |
| A7670E Cat-1 | SMS / HTTP uplink |
| Active buzzer 5 V + NPN (2N2222/S8050) + 1 kΩ | Cabin alarm |
| Momentary 12 mm button | Driver cancel |
| SSD1306 128x64 I2C OLED (0x3C) | Optional setup/status display, shared I2C |
| LM2596S buck | 12 V → 5 V |
| 18650 shield V8 + 2 cells | Backup power |
| 1000 µF / 16 V | Modem current buffer |
| 2–3 A fuse + rocker switch | Protection and cutoff |
| 1 kΩ / 10 kΩ resistors | NPN base, sense dividers |
