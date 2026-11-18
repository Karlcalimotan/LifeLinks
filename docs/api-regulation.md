# API regulation conformance

The contract is the root [`API_REGULATION.md`](../API_REGULATION.md), with the
reference implementation kept in [`API-regulation/`](../API-regulation/).

## What LifeLink implements

| Area | Status |
| --- | --- |
| `{data, meta}` success envelope | Yes, plus `meta.request_id` |
| `{error}` envelope with `code`, `message`, `details`, `request_id` | Yes |
| `X-Request-Id` on every response | Yes, sanitized and echoed in the body |
| `Server-Timing: total;dur=…` | Yes; `X-Response-Time` also set |
| SLOW >300 ms / VIOLATION >400 ms logs | Yes, with route, status and request id |
| 2 000 ms hard timeout | Yes for hot API routes; `504 TIMEOUT` |
| `Cache-Control: no-store` on device API | Yes |
| Reference-data cache | Org settings cached for 60 s, invalidated after a settings write |
| No N+1 on the device-watch cron | Yes, one read + one batched insert |
| Singapore function region | Yes, `regions: ["sin1"]` in `vercel.json` |
| Latency check | `scripts/api-latency.mjs` (warm-up, 30 samples, p95/max) |

## Region

The Supabase pooler is in `ap-southeast-1` (Singapore). Vercel's default function
region is `iad1` (Washington), which adds a cross-region round-trip to every
Prisma query. The repository sets:

```json
"regions": ["sin1"]
```

Keep the dashboard's **Settings → Functions → Function Regions** aligned with
Singapore as well. The dashboard setting is the project default; the repository
configuration is the deployment contract.

## Run the latency check

```bash
API_BASE_URL=http://localhost:3000 pnpm api:latency
LATENCY_MODE=fail API_BASE_URL=https://your-deployment pnpm api:latency
```

Authenticated device routes can be included with:

```bash
API_LATENCY_ENDPOINTS="/api/device/command?device_id=..." \
API_LATENCY_HEADERS='{"x-device-token":"llk_..."}' \
pnpm api:latency
```

The script measures end-to-end HTTP time; compare `Server-Timing` for the
server-only number. On a protected Vercel deployment, use a deployment
protection bypass or an authenticated test environment.

## Documented exceptions

- `/api/health` returns a flat operational JSON body instead of `{data, meta}`.
  It still carries the timing and request-id headers.
- `/api/cron/device-watch` uses a 60 s timeout because it is a background watch
  job, not a screen hot path.
- Device routes authenticate with `x-device-token`, not a bearer token.
- Project error codes keep the existing `UNAUTHORIZED` and `INTERNAL` names;
  clients branch on the stable code, not the HTTP message.
- Device endpoints keep their existing `/api/device/*` paths for firmware
  compatibility. A `/api/v1` migration is a separate coordinated release, not a
  silent path change.

## Still open

- The database portion of `Server-Timing` is reserved in the request context but
  not yet populated by Prisma instrumentation. Add it when query-level timing is
  needed.
- The latency suite is a local/operational check, not a CI gate yet. Run it in
  warn mode, then switch `LATENCY_MODE=fail` after the first deployment passes.
