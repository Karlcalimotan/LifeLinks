# Wiring and pre-power checklist

This is the canonical wiring reference. The code source of truth is
[`firmware/include/pins.h`](../firmware/include/pins.h); the two must agree.
Do not duplicate the pin map in other documents.

Hardware bring-up, bench testing and flashing are owned by the human hardware
owner (Jeff). The agent may write and test code but must not power, wire or
flash the device.

## Project summary

ESP32 DevKit V1 (30-pin) firmware that detects a vehicle crash, gets the GPS
position, and sends an alert over 4G unless the driver presses Cancel during a
countdown.

### Hardware

- ESP32 DevKit V1 (30-pin, ESP32-WROOM-32)
- MPU-6050 (GY-521) accelerometer + gyro, I2C
- SW-420 vibration sensor module (digital output)
- NEO-6M GPS (GY-GPS6MV2), UART1
- A7670E 4G LTE Cat-1 core board, UART2, nano SIM
- Cancel button (12 mm panel mount, active LOW)
- Active buzzer 5 V, switched by NPN (2N2222 / S8050) + 1 kΩ base resistor
- Vehicle 12 V, then fuse + rocker switch, then LM2596S buck (set to 5.0-5.1 V),
  then 18650 shield V8 (2 x 3200 mAh) giving the 5 V rail
- 1000 µF 16 V capacitor across V8 5V OUT and GND (close to the A7670E)

## Pin map

| Function | ESP32 GPIO | Notes |
|---|---|---|
| SW-420 DO | 32 | digital in |
| Cancel button | 33 | INPUT_PULLUP, active LOW |
| Buzzer driver (NPN base via 1 kΩ) | 25 | active HIGH |
| GPS RX (GPS TXD to ESP32) | 26 | UART1 remap |
| GPS TX (ESP32 to GPS RXD) | 27 | UART1 remap |
| A7670E RX (A7670E TXD to ESP32) | 16 | UART2 RX2 |
| A7670E TX (ESP32 to A7670E RXD) | 17 | UART2 TX2 |
| A7670E PWRKEY | 4 | optional |
| MPU-6050 SDA | 21 | I2C |
| MPU-6050 SCL | 22 | I2C |
| MPU-6050 INT | 23 | optional |
| Battery sense | 34 | optional; input-only, external divider required |
| Ignition sense | 35 | optional; input-only, external divider required |
| WiFi reset button | 13 | INPUT_PULLUP, active LOW, boot-only 5 s |
| Factory reset button | 14 | INPUT_PULLUP, active LOW, boot-only 10 s |

Power: ESP32 VIN = 5 V rail. MPU-6050, SW-420 and NEO-6M VCC = 3V3. A7670E
VIN = 5 V rail. All grounds common.

Do not use strapping pins GPIO 0, 2, 5, 12, 15 for new features.

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
- [ ] Avoid connecting USB while the V8 powers VIN unless your DevKit blocks
      backfeed.

Recommended additions for the vehicle 12 V input:

- Reverse-polarity protection (diode or P-MOSFET).
- TVS diode (e.g. SMBJ24A) before the LM2596 for load-dump and spikes.
- Rigidly mount the SW-420 and MPU-6050 so vibration does not cause false
  triggers.

## Related documents

- [`hardware.md`](hardware.md) — sensor notes, bench checklist, bill of materials.
- [`safety.md`](safety.md) — crash/cancel/alert state machine and false-positive
  matrix.
- [`../firmware/README.md`](../firmware/README.md) — build, test and provisioning.
