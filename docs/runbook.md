# Runbook

Operational notes for the LifeLink tracker. The full bench and field checklist
lives in [`hardware.md`](hardware.md#bench-checklist); wiring lives in
[`wiring.md`](wiring.md).

Hardware bring-up, flashing and bench testing are owned by the human hardware
owner (Jeff). The agent must not power, wire or flash the device.

## 1. Prerequisites

- Python 3.12 or newer
- PlatformIO: `python -m pip install platformio`
- clang-format: `python -m pip install clang-format`
- A host C/C++ compiler for the `native` tests (gcc/g++ on Linux; MinGW-w64 on
  Windows)
- Bash (Git Bash on Windows, or any POSIX shell)

On a Windows machine with an Application Control policy that blocks newly built
executables, the native test binaries cannot run locally even though they
compile. Use CI (or a development machine without that policy) for the test
execution; do not disable the policy to run them.

## 2. Local gate

Run this before every PR:

```bash
bash scripts/verify.sh
```

It performs:

1. ESP32 firmware build (`pio run -d firmware`)
2. native Unity tests (`pio test -d firmware -e native`)
3. static analysis (`pio check -d firmware --fail-on-defect high`)
4. clang-format check over `firmware/main/` and `firmware/include/`

The web app has its own gate: `pnpm self-check`.

## 3. Build and flash

Build only:

```bash
pio run -d firmware
```

Flash (human owner only):

```bash
pio run -d firmware -t upload
pio device monitor -b 115200
```

The agent permission configuration denies upload targets.

## 4. Provisioning

The preferred path is the WiFi commissioning portal. On an unprovisioned unit,
or after three failed joins of the stored network, join the `LifeLink-XXXX`
access point (last four hex digits of the eFuse MAC) and open
`http://192.168.4.1`. The page scans 2.4 GHz networks, accepts a manual SSID and
tests the network before saving. See
[`hardware.md`](hardware.md#wifi-commissioning-and-the-reset-gesture) for the
portal and the GPIO 33 reset gesture.

Serial commands remain available for bench work:

```text
SET_ID AA:BB:CC:DD:EE:01
SET_TOKEN tf_...
SET_PHONE1 +639171234567
SET_PHONE2 +639181234567
SET_PLATE ABC 1234
STATUS
REBOOT
```

Values are stored in NVS under the `lifelink` namespace. The token is the one
shown once by the console's tracker registration form.

Expected boot lines:

```text
[FIRMWARE] LifeLink 0.3.1
[WIRING] MPU 0x69+DS3231 0x68+OLED 0x3C 21/22, SW-420 27, cancel 33, GPS 16/17, modem 18/19, buzzer 25
[IMU] MPU-6050 ready at 0x69
[RTC] DS3231 ready at 0x68
[WIFI] ...
[READY] LifeLink tracker online
```

## 5. Health checks

- `STATUS` prints the device id, whether a token is set, the config revision and
  the current alert state.
- A heartbeat every 30 s (configurable) carries GPS fix age, satellites, HDOP,
  acceleration, tilt, vibration and modem signal.
- The console should show the tracker as online and the latest telemetry.

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| No serial output | Correct COM port, 115200 baud, USB cable is data-capable |
| `MPU-6050 not found at 0x69` | SDA 21 / SCL 22, 3V3 and GND, AD0 tied to 3.3V (0x69; 0x68 belongs to the DS3231) |
| `no DS3231` on boot | RTC VCC/GND and SDA 21 / SCL 22; the tracker continues without it, using GPS time |
| RTC time wrong after a battery change | Set it with `SET_TIME <epoch>`; the DS3231 resyncs from GPS within an hour once Idle |
| No GPS fix | Antenna view of the sky, NEO-6M TX to GPIO 16, 9600 baud, allow cold-start time |
| Modem does not answer `AT` | 5 V rail, common ground, PWRKEY pulse, SIM seated, UART 18/19 crossed correctly |
| SMS not delivered | SIM credit, carrier bands, phone number format, `AT+CMGS` response |
| HTTP 401/403 | Device token missing or revoked; reprovision with `SET_TOKEN` |
| Random resets during transmit | 1000 µF capacitor, buck current rating, battery discharge capability |
| False alerts on potholes | Recheck the bench matrix and tune thresholds with recorded data |

## 7. Bench and field test

Follow the ten-step checklist in
[`hardware.md`](hardware.md#bench-checklist). Do not claim the crash flow works
end to end until the shake test, countdown, cancel, SMS with a position and power
cut have all been observed on the real device.

This runbook will be expanded in the documentation phase.
