#pragma once

// Copy this file to firmware/include/secrets.h (gitignored) only when you need
// compile-time overrides. secrets.h is optional; main.ino includes it only when
// it exists.
//
// The API base is required for a working tracker. The identity is optional: fill
// the device row from the dashboard (the token is shown once, when the tracker
// is registered) and the setup portal will ask for Wi-Fi only. The dashboard
// then supplies the calibration thresholds and alert phones on the command
// poll.
//
//   LIFELINK_DEVICE_ID     optional; defaults to the eFuse MAC
//   LIFELINK_DEVICE_TOKEN   the llk_... value shown once by the dashboard
//
// Leave the identity macros unset to keep the serial `SET_ID` / `SET_TOKEN`
// path or the identity fields in the setup portal.

// #define LIFELINK_API_BASE "https://your-api.example.com"
// #define LIFELINK_DEVICE_ID "34:84:A9:7B:8A:C8"
// #define LIFELINK_DEVICE_TOKEN "llk_replace_with_the_dashboard_token"
