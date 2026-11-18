/*
  ESP32 DevKit V1 (30-pin, DOIT layout) pin map for the LifeLink tracker.

  Check the silkscreen on your board: clones vary. These are the pins from the
  verified wiring diagram and must not be changed casually.

  MPU-6050      SDA 21, SCL 22, INT 23 (optional)
  SW-420        DO 32
  Cancel button 33 (INPUT_PULLUP, active LOW)
  NEO-6M        TX 26 (ESP32 RX1), RX 27 (ESP32 TX1)
  A7670E        TX 17 (ESP32 TX2), RX 16 (ESP32 RX2), PWRKEY 4
  Buzzer        NPN base 25 (active HIGH)
  Power         VIN 5V from the buck + 18650 shield; 1000 uF across 5V/GND
*/
#pragma once

namespace hw {

constexpr int kI2cSda = 21;
constexpr int kI2cScl = 22;
constexpr int kMpuInterrupt = 23;

constexpr int kVibrationSensor = 32;
constexpr int kCancelButton = 33;

constexpr int kGpsRx = 26;
constexpr int kGpsTx = 27;
constexpr int kGpsBaud = 9600;

constexpr int kModemRx = 16;
constexpr int kModemTx = 17;
constexpr int kModemPwrKey = 4;
constexpr int kModemBaud = 115200;

constexpr int kBuzzer = 25;
constexpr bool kBuzzerActiveHigh = true;

// Optional power sensing. The wiring diagram does not include the dividers, so
// this is disabled by default; a floating input would report a random battery
// voltage and ignition state. Enable only after fitting the 10k/2.2k dividers.
constexpr bool kHasPowerSense = false;

constexpr int kBatteryAdc = 34;  // input-only pin, external divider required
constexpr int kIgnitionAdc = 35; // input-only pin, external divider required

constexpr bool kCancelButtonActiveLow = true;

}  // namespace hw
