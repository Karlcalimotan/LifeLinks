# OTA keys

Place **public** signing keys here. The private key must never be committed.

The firmware's update endpoint is disabled until these environment variables are
configured on the server:

```
LIFELINK_FIRMWARE_VERSION
LIFELINK_FIRMWARE_URL
LIFELINK_FIRMWARE_SHA256
LIFELINK_FIRMWARE_SIGNATURE
```

The device must verify the signature before flashing. An unsigned update path is
not acceptable for a safety device.
