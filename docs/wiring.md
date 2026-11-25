# Wiring and pre-power checklist

This is the canonical wiring reference. The code source of truth is
[`firmware/include/pins.h`](../firmware/include/pins.h); the two must agree.
Do not duplicate the pin map in other documents; the visual companion is
[`wiring-diagram.md`](wiring-diagram.md), updated in the same change.

Hardware bring-up, bench testing and flashing are owned by the human hardware
owner (Jeff). The agent may write and test code but must not power, wire or
flash the device.

## Project summary

ESP32 DevKit V1 (30-pin) firmware that detects a vehicle crash, gets the GPS
position, and sends an alert over 4G unless the driver presses Cancel during a
countdown.

### Hardware

- ESP32 DevKit V1 (30-pin, ESP32-WROOM-32)
- MPU-6050 (GY-521) accelerometer + gyro, I2C at `0x69` (AD0 tied to 3V3)
- DS3231 RTC module with a CR2032 backup cell, I2C at `0x68`
- SSD1306 128x64 I2C OLED, optional setup/status display at 0x3C
- SW-420 vibration sensor module (digital output)
- NEO-6M GPS (GY-GPS6MV2), UART1
- A7670E 4G LTE Cat-1 core board, UART2, nano SIM
- Cancel button (12 mm panel mount, active LOW)
- Active buzzer 5 V, driven directly from GPIO 25 on the first board (NPN for a louder harness)
- Vehicle 12 V, then fuse + rocker switch, then LM2596S buck (set to 5.0-5.1 V),
  then 18650 shield V8 (2 x 3200 mAh) giving the 5 V rail
- 1000 µF 16 V capacitor across V8 5V OUT and GND (close to the A7670E)

## Pin map

| Function | ESP32 GPIO | Notes |
|---|---|---|
| SW-420 DO | 27 | digital in, active HIGH (idles LOW) |
| Cancel button | 33 | INPUT_PULLUP, active LOW |
| Status LED | 26 | active HIGH |
| Buzzer + (direct on this board) | 25 | active HIGH |
| GPS RX (GPS TXD to ESP32) | 16 | UART1 remap |
| GPS TX (ESP32 to GPS RXD) | 17 | UART1 remap |
| A7670E RX (A7670E TXD to ESP32) | 18 | UART2 RX2 |
| A7670E TX (ESP32 to A7670E RXD) | 19 | UART2 TX2 |
| A7670E PWRKEY | 4 | optional |
| MPU-6050 SDA | 21 | I2C, shared with the DS3231 and the SSD1306 |
| MPU-6050 SCL | 22 | I2C, shared with the DS3231 and the SSD1306 |
| MPU-6050 INT | 23 | optional |
| Battery sense | 34 | optional; input-only, external divider required |
| Ignition sense | 35 | optional; input-only, external divider required |
| WiFi reset button | 13 | INPUT_PULLUP, active LOW, boot-only 5 s |
| Factory reset button | 14 | INPUT_PULLUP, active LOW, boot-only 10 s |

Power: ESP32 VIN = 5 V rail. MPU-6050, SW-420, NEO-6M, the DS3231 and the
optional SSD1306 VCC = 3V3. A7670E VIN = 5 V rail. All grounds common.

Do not use strapping pins GPIO 0, 2, 5, 12, 15 for new features.

## I2C bus and addresses

Three devices share SDA 21 / SCL 22. The RTC needs no new ESP32 pin: its 32K,
SQW and INT pins stay unconnected.

| Device | Address | Notes |
|---|---|---|
| DS3231 RTC | `0x68` | VCC 3V3, GND, SDA 21, SCL 22, CR2032 backup cell |
| MPU-6050 | `0x69` | AD0 tied to 3V3; the factory default `0x68` now belongs to the RTC |
| SSD1306 OLED | `0x3C` | optional; no reset line wired, VCC 3V3, never 5 V |

- **MPU-6050 AD0:** tie AD0 to 3V3 (never 5 V) before the first power-on. With
  AD0 low the IMU answers at `0x68` alongside the RTC, the IMU probe at `0x69`
  finds nothing, and the tracker loses acceleration/tilt confirmation. The
  shared address can also corrupt the RTC reads.
- **DS3231 VCC:** 3V3 only. Many modules accept 5 V, but their I2C pull-ups
  then sit on 5 V and the ESP32 pins are not 5 V tolerant. Powering the module
  from 3V3 keeps the whole bus at 3.3 V.
- **Pull-ups:** the RTC, IMU and OLED modules each carry their own, so the bus
  ends up with several in parallel. That is fine at 100 kHz and at the
  display's 400 kHz bursts; do not add more.
- **ZS-042 style modules** also carry an AT24C32 EEPROM at `0x57`. The firmware
  does not use it; an I2C scan still shows it.
- **Coin cell:** fit the CR2032 the module expects. Many ZS-042 boards include
  a charging resistor and diode intended for a rechargeable LIR2032; with a
  non-rechargeable CR2032 fitted, remove that resistor or use the LIR2032 the
  board was built for. A missing or flat cell is not a safety issue: the clock
  restarts at 2000-01-01 and the firmware treats that as unknown.
- **Bench check:** an I2C scan must show `0x68` (RTC), `0x69` (IMU) and, when
  the panel is fitted, `0x3C` (OLED). A missing `0x69` means AD0 is still low.

## Power chain

```
Vehicle 12 V
  └─ 2-3 A fuse + rocker switch
       └─ LM2596S buck, set to 5.0-5.1 V with a meter BEFORE connecting the shield
            └─ 18650 shield V8 (5V IN)
                 └─ 5V OUT ── 1000 µF / 16 V ── GND
                      ├─ ESP32 VIN (5 V)
                      ├─ A7670E VIN (5 V)
                      └─ 3.3 V regulator on the DevKit
                           ├─ MPU-6050 VCC
                           ├─ DS3231 VCC
                           ├─ SW-420 VCC
                           └─ NEO-6M VCC
```

- The 1000 µF capacitor is not decoration. The A7670E can pull amp-scale bursts
  during registration and transmission. Mount it close to the modem, stripe to
  GND.
- The buck output must be set **before** the shield is connected. The shield's
  switch must be on HOLD (NORMAL cuts the output after about 10 s when the load
  is under about 30-50 mA).
- The buzzer is a 5 V load switched by an NPN (2N2222/S8050). The ESP32 pin
  drives the base through 1 kΩ; the emitter goes to GND; the buzzer negative
  goes to the collector; the buzzer positive goes to 5 V. Add a flyback diode
  across the buzzer if it is magnetic.
- All grounds are common. The buck, shield, ESP32, sensors and modem must share
  GND.
- The optional SSD1306 status display is powered from the DevKit 3V3 rail and
  shares SDA 21 / SCL 22 with the MPU-6050. Never power it from 5 V.

## Pre-power checklist (human)

Before powering on:

- [ ] Set the buck to 5.0-5.1 V with a multimeter **before** connecting it to the
      V8 shield.
- [ ] V8 side switch on HOLD (NORMAL cuts the output after about 10 s when the
      load is under about 30-50 mA).
- [ ] Check +/- polarity before inserting the 18650 cells; use a matched pair.
- [ ] 1000 µF 16 V across V8 5V OUT and GND, striped leg to GND, close to the
      A7670E.
- [ ] Buzzer is switched by an NPN + 1 kΩ (add them if not in your parts list).
- [ ] Verify on your A7670E board: UART level (3.3 V TTL default) and minimum VIN
      (some list 5-16 V).
- [ ] A7670E LTE bands are B1/B3/B5/B8/B20 only (no B28, B40, B41): check against
      your SIM carrier.
- [ ] MPU-6050 AD0 is jumpered to 3V3, not left floating and not tied to 5 V. The
      IMU must answer at `0x69`; the DS3231 owns `0x68`.
- [ ] DS3231 VCC goes to 3V3, never the 5 V rail. Fit the CR2032 the right way
      round, or the LIR2032 the module's charging circuit expects.
- [ ] Avoid connecting USB while the V8 powers VIN unless your DevKit blocks
      backfeed.

Recommended additions for the vehicle 12 V input:

- Reverse-polarity protection (diode or P-MOSFET).
- TVS diode (e.g. SMBJ24A) before the LM2596 for load-dump and spikes.
- Rigidly mount the SW-420 and MPU-6050 so vibration does not cause false
  triggers.

## Related documents

- [`wiring-diagram.md`](wiring-diagram.md) — visual pin map, I2C/UART and power diagrams.
- [`hardware.md`](hardware.md) — sensor notes, bench checklist, bill of materials.
- [`safety.md`](safety.md) — crash/cancel/alert state machine and false-positive
  matrix.
- [`../firmware/README.md`](../firmware/README.md) — build, test and provisioning.
