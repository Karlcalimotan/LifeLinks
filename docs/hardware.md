# Hardware

Board: **ESP32 DevKit V1 (30-pin, DOIT layout)**. Check the silkscreen on your
board; clones differ.

## Pin map

| Signal | ESP32 pin | Notes |
| --- | --- | --- |
| MPU-6050 SDA | GPIO 21 | I2C |
| MPU-6050 SCL | GPIO 22 | I2C |
| MPU-6050 INT | GPIO 23 | Optional; the sketch polls, so it works without it |
| SW-420 DO | GPIO 32 | Digital input; LOW on vibration on the common module |
| Cancel button | GPIO 33 | `INPUT_PULLUP`, active LOW, momentary to GND |
| NEO-6M TX | GPIO 26 | ESP32 RX1 (`Serial1`) |
| NEO-6M RX | GPIO 27 | ESP32 TX1 |
| A7670E TX | GPIO 17 | ESP32 TX2 (`Serial2`) |
| A7670E RX | GPIO 16 | ESP32 RX2 |
| A7670E PWRKEY | GPIO 4 | Active LOW; the sketch pulses it low for 1.2 s, then releases it HIGH |
| Buzzer NPN base | GPIO 25 | 1 kΩ to the base; active HIGH |
| Battery sense | GPIO 34 | Optional; input-only, needs a divider. Disabled by default |
| Ignition sense | GPIO 35 | Optional; input-only, needs a divider. Disabled by default |

The GPS and modem UARTs are **remapped** UART1/UART2, not the USB serial pins.
GPIO 1/3 stay free for the USB monitor.

## Power chain

```
Vehicle 12 V
  └─ 2–3 A fuse + rocker switch
       └─ LM2596S buck, set to 5.0–5.1 V with a meter BEFORE connecting the shield
            └─ 18650 shield V8 (5V IN)
                 └─ 5V OUT ── 1000 µF / 16 V ── GND
                      ├─ ESP32 VIN (5 V)
                      ├─ A7670E VIN (5 V)
                      └─ 3.3 V regulator on the DevKit
                           ├─ MPU-6050 VCC
                           ├─ SW-420 VCC
                           └─ NEO-6M VCC
```

- The 1000 µF capacitor is not decoration. The A7670E can pull amp-scale
  bursts during registration and transmission. Mount it close to the modem,
  stripe to GND.
- The buck output must be set **before** the shield is connected. The shield's
  switch must be ON for the backup path to work.
- The buzzer is a 5 V load switched by an NPN (2N2222/S8050). The ESP32 pin
  drives the base through 1 kΩ; the emitter goes to GND; the buzzer negative
  goes to the collector; the buzzer positive goes to 5 V. Add a flyback diode
  across the buzzer if it is magnetic.
- All grounds are common. The buck, shield, ESP32, sensors and modem must share
  GND.

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
| LM2596S buck | 12 V → 5 V |
| 18650 shield V8 + 2 cells | Backup power |
| 1000 µF / 16 V | Modem current buffer |
| 2–3 A fuse + rocker switch | Protection and cutoff |
| 1 kΩ / 10 kΩ resistors | NPN base, sense dividers |
