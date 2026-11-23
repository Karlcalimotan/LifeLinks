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

#include <pins.h>

namespace hw {

constexpr int kI2cSda = PIN_MPU_SDA;
constexpr int kI2cScl = PIN_MPU_SCL;
constexpr int kMpuInterrupt = PIN_MPU_INT;

constexpr int kVibrationSensor = PIN_SW420_DO;
constexpr int kCancelButton = PIN_CANCEL_BTN;
constexpr int kWifiResetButton = PIN_WIFI_RESET;
constexpr int kFactoryResetButton = PIN_FACTORY_RESET;

constexpr int kGpsRx = PIN_GPS_RX;
constexpr int kGpsTx = PIN_GPS_TX;
constexpr int kGpsBaud = 9600;

constexpr int kModemRx = PIN_MODEM_RX;
constexpr int kModemTx = PIN_MODEM_TX;
constexpr int kModemPwrKey = PIN_MODEM_PWRKEY;
constexpr int kModemBaud = 115200;

constexpr int kBuzzer = PIN_BUZZER;
constexpr bool kBuzzerActiveHigh = true;

// Optional power sensing. The wiring diagram does not include the dividers, so
// this is disabled by default; a floating input would report a random battery
// voltage and ignition state. Enable only after fitting the 10k/2.2k dividers.
constexpr bool kHasPowerSense = false;

// Input-only pins; both need an external divider before they are connected.
constexpr int kBatteryAdc = PIN_BATTERY_ADC;
constexpr int kIgnitionAdc = PIN_IGNITION_ADC;

constexpr bool kCancelButtonActiveLow = true;

}  // namespace hw
