# Bench unit handoff (`34:84:A9:7B:8A:C8`)

This is the handoff for the first physical tracker, a.k.a. the bench unit. The
agent can provision the database row and the token, but **hardware bring-up and
flashing belong to the hardware owner**. This page records what is ready, what
is blocked, and the exact steps.

## What is provisioned

- Local development database (`lifelink`, Docker on `localhost:55432`).
- Device row: MAC `34:84:A9:7B:8A:C8`, label **First LifeLink**, approval
  **APPROVED**, org `demo`, no vehicle assigned yet.
- A one-time device token was generated and written **outside the repository**
  to:

  ```text
  C:\Users\Lenovo\AppData\Local\Temp\opencode\lifelink-bench-device-token.txt
  ```

  The database stores only `sha256(token)`. Move the token into the tracker's
  NVS with `SET_TOKEN`, then delete the file and rotate the token if it was
  exposed. Never commit it or paste it into an issue.

This is **local only**. The live-org registration is tracked in #113 and is
blocked by the Vercel/Supabase access in #17.

## Reachability: the real blocker

The firmware sends HTTP through the **A7670E modem**, not the ESP32 WiFi link
(`modemHttpRequest` in `firmware/main/main.ino`). The modem is on the mobile
network, so it cannot reach a laptop LAN address such as
`http://192.168.1.28:3000`.

Choose one reachable base URL before flashing:

| Option | Base URL | Notes |
| --- | --- | --- |
| Deploy the console | `https://<project>.vercel.app` | Preferred once #17 grants project access. Needs the production/development database decision. |
| Temporary HTTPS tunnel | `https://<random>.trycloudflare.com` etc. | Exposes the local dev server to the internet. Owner decision; stop it after the bench session. |
| Firmware WiFi HTTP path | `http://192.168.1.28:3000` | Requires a firmware change so HTTP uses `WiFiClient` when associated. Not implemented; hardware-tested change. |

Do not put a production database behind a tunnel. For this local bench unit,
the demo org is the target.

## Hardware-owner steps

1. Create `firmware/include/secrets.h` (gitignored) from
   `firmware/include/secrets.example.h` and set the reachable base URL:

   ```cpp
   #define LIFELINK_API_BASE "https://<reachable-host>"
   ```

2. Flash the firmware over USB. This repository's agents do not flash.
3. Provision over the serial console at 115200 baud:

   ```text
   SET_ID 34:84:A9:7B:8A:C8
   SET_TOKEN <contents of the token file>
   SET_PHONE1 +639171234567
   STATUS
   ```

4. Confirm the tracker appears in **Trackers** with a fresh `lastSeenAt`, and
   that the dashboard shows **First LifeLink** as online once the heartbeat
   arrives.

## Local API smoke test

Before the hardware session, prove the backend path with the real token while
the app is running:

```powershell
$token = (Get-Content "C:\Users\Lenovo\AppData\Local\Temp\opencode\lifelink-bench-device-token.txt").Trim()
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/device/heartbeat" `
  -Headers @{ "x-device-token" = $token } `
  -ContentType "application/json" `
  -Body '{"device_id":"34:84:A9:7B:8A:C8","firmware_version":"0.2.0","heartbeat":{"battery_v":12.4,"ignition":true,"rssi_dbm":-71,"satellites":8,"hdop":1.2,"lat":10.3157,"lng":123.8854,"gps_fix_age_s":3}}'
```

A `200` with `received: true` proves token auth, approval, rate limiting and the
state update. This does **not** prove the modem path or the A7670E header
parameter; those are bench checks.

## Safety

- The tracker is a crash detector, not a certified emergency device.
- Bench-test the cancel window, false positives, SMS delivery and the power-cut
  path before putting it in a vehicle.
- The token is a credential: rotate it from the tracker detail page if it leaks.
