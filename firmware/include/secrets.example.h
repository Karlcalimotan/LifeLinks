#pragma once

// Copy this file to firmware/include/secrets.h (gitignored) only when you need
// compile-time overrides. Runtime identity, token and phone numbers are stored
// in NVS through the serial provisioning commands, so they do not belong here.
//
// secrets.h is optional. main.ino includes it only when it exists.
//
// #define LIFELINK_API_BASE "https://your-api.example.com"
