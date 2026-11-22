#pragma once
// Matches the circuit diagram. Do not change without updating docs/wiring.md.
// clang-format off
constexpr int PIN_SW420_DO     = 32;
constexpr int PIN_CANCEL_BTN   = 33;  // INPUT_PULLUP, active LOW
constexpr int PIN_BUZZER       = 25;  // active HIGH -> 1k -> NPN base
constexpr int PIN_GPS_RX       = 26;  // UART1 remap (GPS TXD)
constexpr int PIN_GPS_TX       = 27;  // UART1 remap (GPS RXD)
constexpr int PIN_MODEM_RX     = 16;  // UART2 RX2 (A7670E TXD)
constexpr int PIN_MODEM_TX     = 17;  // UART2 TX2 (A7670E RXD)
constexpr int PIN_MODEM_PWRKEY = 4;   // optional
constexpr int PIN_MPU_SDA      = 21;
constexpr int PIN_MPU_SCL      = 22;
constexpr int PIN_MPU_INT      = 23;  // optional
constexpr int PIN_BATTERY_ADC  = 34;  // optional, input-only, divider required
constexpr int PIN_IGNITION_ADC = 35;  // optional, input-only, divider required
// clang-format on
