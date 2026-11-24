# Device API

Base path: `/api`. Every JSON response uses one envelope, following
[`API_REGULATION.md`](../API_REGULATION.md):

```json
{ "data": { }, "meta": { "requestId": "…", "request_id": "…", "generatedAt": "…" } }
```

Errors:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Device is not approved.",
    "request_id": "…"
  },
  "meta": { "requestId": "…", "request_id": "…" }
}
```

Every response carries `x-request-id`, `x-response-time`, `server-timing` and
`cache-control: no-store`. Hot API routes have a **2 second** hard timeout and
return `504 TIMEOUT` beyond it. Requests over 300 ms are logged as `SLOW`; over
400 ms as `VIOLATION`. See [`api-regulation.md`](api-regulation.md) for the
conformance table and latency check.

## Authentication

The tracker sends its provisioning token in the header:

```
x-device-token: llk_<random>
```

The database stores `sha256(token)` only. A token is shown once when the device
is registered or rotated. A `PENDING`, `REJECTED` or `SUSPENDED` device is
authenticated but returns `403`; an unknown token returns `401`.

Device routes are rate-limited per device: heartbeat **60/min**, ingest
**120/min**, incident **30/min**, cancel **20/min**, command poll **120/min** and
command acknowledgement **60/min**. Application search is **60/min** per
signed-in user and health checks are **60/min** per IP. Exceeding a limit returns
`429 RATE_LIMITED` with a retry hint. The limiter is in-process; a multi-instance
deployment should replace it with a shared store.

## Endpoints

### `POST /api/device/heartbeat`

Heartbeat-only state refresh. Use this when the tracker does not need to send a
telemetry batch.

```json
{
  "device_id": "AA:BB:CC:DD:EE:01",
  "firmware_version": "0.2.0",
  "heartbeat": {
    "battery_v": 12.4,
    "ignition": true,
    "rssi_dbm": -71,
    "satellites": 8,
    "hdop": 1.2,
    "lat": 10.3157,
    "lng": 123.8854,
    "gps_fix_age_s": 3,
    "accel_g": 0.4,
    "tilt_deg": 2.1,
    "vibration": false,
    "config_rev": 123456789
  }
}
```

The optional `Idempotency-Key` header is stored as the `HEARTBEAT` event's
client id; a retry with the same key does not duplicate the event. The tracker
state update itself is naturally idempotent.

```json
{ "data": { "received": true, "duplicate": false, "server_time": 1763472005, "config_rev": 123456789, "heartbeat_interval_s": 30 } }
```

### `POST /api/device/ingest`

Heartbeat, batched telemetry and events.

```json
{
  "device_id": "AA:BB:CC:DD:EE:01",
  "firmware_version": "0.1.0",
  "heartbeat": {
    "battery_v": 12.4,
    "ignition": true,
    "rssi_dbm": -71,
    "satellites": 8,
    "hdop": 1.2,
    "lat": 10.3157,
    "lng": 123.8854,
    "gps_fix_age_s": 3,
    "accel_g": 0.4,
    "tilt_deg": 2.1,
    "vibration": false,
    "config_rev": 123456789
  },
  "samples": [
    {
      "id": "sample-0001",
      "t": 1763472000,
      "lat": 10.3157,
      "lng": 123.8854,
      "speed_kph": 45,
      "accel_g": 0.4,
      "tilt_deg": 2.1,
      "vibration": false
    }
  ],
  "events": [
    { "id": "evt-1", "type": "POWER_RESTORED", "t": 1763472000, "meta": {} }
  ]
}
```

Response:

```json
{
  "data": {
    "received": true,
    "server_time": 1763472005,
    "config_rev": 123456789,
    "heartbeat_interval_s": 30
  }
}
```

Idempotency: `(deviceId, clientSampleId)` is unique for telemetry and
`(deviceId, clientEventId)` is unique for device events; a retried batch skips
duplicates. A device clock that is more than 5 minutes in the future or 30 days
in the past is ignored and the receipt time is used.

### `POST /api/device/incident`

```json
{
  "device_id": "AA:BB:CC:DD:EE:01",
  "incident_id": "tf-1a2b3c4d-0001",
  "detected_at": 1763472000,
  "peak_accel_g": 3.8,
  "tilt_deg": 72,
  "vibration_count": 14,
  "speed_kph": 45,
  "lat": 10.3157,
  "lng": 123.8854,
  "gps_age_s": 3,
  "status": "SUSPECTED",
  "cancelled": false,
  "evidence": {
    "samples": [{ "t": 1763472000, "accel_g": 3.8, "tilt_deg": 72 }]
  }
}
```

- `status` is `SUSPECTED`, `CONFIRMED` or `CANCELLED`.
- The first call creates the incident and queues the configured alert targets.
- A `SUSPECTED` incident can be upgraded to `CONFIRMED` by a later retry with the
  same `incident_id`; alerts are queued only once.
- A duplicate `CONFIRMED` returns `duplicate: true` and does not create a second
  alert storm.
- A cancelled incident is never resurrected.
- `evidence` and event `meta` are capped at 32 top-level keys and 8 KiB when
  serialized. Larger payloads return `400 BAD_REQUEST`.

Response:

```json
{ "data": { "received": true, "incident_id": "cuid", "status": "CONFIRMED", "duplicate": false, "alerts_queued": 2 } }
```

### `POST /api/device/incident/cancel`

```json
{ "device_id": "AA:BB:CC:DD:EE:01", "incident_id": "tf-1a2b3c4d-0001", "cancelled_at": 1763472005 }
```

Moves the incident to `CANCELLED`, writes a `DeviceStateEvent` and resolves the
driver's false alarm visibly. The incident must still be `SUSPECTED` or
`CONFIRMED`, and the server clock must be no later than the stored
`cancelDeadline` plus 30 seconds of clock-skew tolerance. A late or
already-handled attempt returns `409 CONFLICT` without changing the incident and
is recorded in the audit log. Repeating a cancel for an already `CANCELLED`
incident is idempotent.

### `GET /api/device/command?device_id=<mac>`

Returns queued commands, the alert phone list and the versioned config:

```json
{
  "data": {
    "server_time": 1763472005,
    "alert_phones": ["+639171234567"],
    "commands": [{ "id": "cuid", "kind": "LOCATE", "payload": {}, "created_at": 1763472000 }],
    "config": {
      "version": 1,
      "rev": 123456789,
      "impact_threshold_g": 2.5,
      "tilt_threshold_deg": 60,
      "confirm_window_ms": 200,
      "cancel_window_s": 15,
      "heartbeat_interval_s": 30,
      "sos_retry_s": 60
    }
  }
}
```

Commands are delivered until acknowledged or expired. The device dedupes by
command id.

### `POST /api/device/command/ack`

```json
{ "device_id": "AA:BB:CC:DD:EE:01", "command_id": "cuid", "status": "ACKED", "detail": "located" }
```

### `GET /api/firmware/check?device_id=<mac>&version=<current>`

Returns a signed manifest only when these are configured:

```
LIFELINK_FIRMWARE_VERSION
LIFELINK_FIRMWARE_URL
LIFELINK_FIRMWARE_SHA256
LIFELINK_FIRMWARE_SIGNATURE
```

With no release configured it returns `update_available: false` and
`reason: "no_release_configured"`. There is no unsigned update path.

### `GET /api/cron/device-watch`

Requires `Authorization: Bearer $CRON_SECRET`. Writes at most one
`DEVICE_OFFLINE` event per device per hour when `lastSeenAt` is older than the
offline window. It never changes an incident.

### `GET /api/health`

Returns `200` when PostgreSQL answers `SELECT 1`, `503` otherwise. No auth. The
database check is cached for five seconds and callers are rate-limited per IP.
The response reports status and database reachability only; it never lists which
environment variables or secrets are configured.

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Schema validation failed |
| `UNAUTHORIZED` | 401 | Missing or unknown device token |
| `FORBIDDEN` | 403 | Device not approved, or `device_id` mismatch |
| `NOT_FOUND` | 404 | Unknown command or incident |
| `CONFLICT` | 409 | No vehicle assigned, or the cancel window closed / incident no longer cancellable |
| `RATE_LIMITED` | 429 | Login, search, health or device rate limit |
| `INTERNAL` | 500/504 | Unexpected failure or timeout |

## Try it locally

```bash
# Seed tokens are printed by pnpm seed
curl -s http://localhost:3000/api/device/command?device_id=AA:BB:CC:DD:EE:01 \
  -H "x-device-token: llk_demo_navara_token"

curl -s -X POST http://localhost:3000/api/device/ingest \
  -H "content-type: application/json" \
  -H "x-device-token: llk_demo_navara_token" \
  -d '{"device_id":"AA:BB:CC:DD:EE:01","heartbeat":{"battery_v":12.4,"ignition":true}}'
```
