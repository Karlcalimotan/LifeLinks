# LifeLink

![LifeLink logo](apps/web/public/logo.svg)

Crash detection and emergency response for every vehicle. LifeLink is a lean
fleet console plus an ESP32 tracker: impact and tilt detection, a visible
cancellation window, SMS alerts that survive a backend outage, and an incident
trail for the people who have to respond.

> LifeLink is a prototype, not a substitute for emergency services. Bench-test
> the cancel window, false positives, SMS delivery and the power-cut path before
> putting it in a vehicle.

## Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Database:** Supabase (PostgreSQL) + Prisma
- **Auth:** self-contained credentials auth (bcrypt + signed HttpOnly cookie)
- **i18n:** next-intl (English, Tagalog)
- **Styling:** Tailwind CSS 4
- **Firmware:** PlatformIO, ESP32 DevKit V1, MPU-6050, SW-420, NEO-6M, A7670E
- **Quality:** Biome, Vitest, Playwright, native Unity tests for pure firmware logic

## Quick start

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # fill in the Supabase URLs
pnpm prisma:deploy
SEED_DEMO=yes pnpm seed                  # PowerShell: $env:SEED_DEMO="yes"; pnpm seed
pnpm dev
```

Open http://localhost:3000 and sign in with one of the three demo roles:

| Role | Email | Password | Sees |
| --- | --- | --- | --- |
| Admin | `admin@lifelink.local` | `Admin123!` | The whole fleet, trackers and settings |
| Vehicle owner | `owner@lifelink.local` | `Owner123!` | Only the vehicles owned by that user |
| CDRRMO / Pulis | `responder@lifelink.local` | `Responder123!` | The whole fleet and every incident |

The seed creates 11 vehicles (three owned by the demo owner plus unowned fleet
units), 13 trackers (10 approved, 2 pending and 1 rejected), 26 trips,
telemetry and device events, and 13 incidents across every workflow status with
alert deliveries in mixed states.

The app needs a Supabase project (or any PostgreSQL 14+ instance). See
[`docs/local-database.md`](docs/local-database.md) for the pooled `DATABASE_URL`,
the `DIRECT_URL` used by migrations, and the seed guard.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next dev server |
| `pnpm build` | Prisma generate + production build |
| `pnpm lint` | Biome |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Vitest |
| `pnpm test:e2e` | Playwright |
| `pnpm prisma:generate` | Regenerate the Prisma client |
| `pnpm prisma:migrate` | Create a migration in development |
| `pnpm prisma:deploy` | Apply migrations |
| `pnpm seed` | Demo fleet data |
| `pnpm gen <command> <name>` | Generate a feature, device route, firmware module or model |
| `pnpm stack:check` | Static template checks + contract drift |
| `pnpm api:latency` | Warm-up + p95/max latency check for API endpoints |
| `pnpm self-check` | Full local gate |
| `bash scripts/verify.sh` | Firmware build, native tests, static analysis, formatting |

## Structure

```
apps/web/                 Next.js console and device API
  app/[locale]/           localized pages (login, dashboard, vehicles, incidents, devices, settings)
  app/api/device/         ingest, incident, cancel, command, ack
  app/api/firmware/       signed-release check
  app/api/cron/           stale-device watch
  components/             UI primitives, layout, domain cards
  lib/api/                one envelope + request pipeline
  lib/auth/               session, password, role guards
  lib/device/             hashed-token auth, status, schemas
  lib/firmware/           server half of the config contract
  lib/incidents/          severity and state transitions
  prisma/                 schema, migration, seed
firmware/main/            PlatformIO sketch (main.ino), pure headers, native tests
firmware/include/         canonical pin map and optional secrets template
docs/                     architecture, hardware, safety, API, ADRs
stack/                    reusable scaffold + generators (not copied to new projects)
```

## Documentation

Start with [`docs/architecture.md`](docs/architecture.md), then
[`docs/wiring.md`](docs/wiring.md), [`docs/hardware.md`](docs/hardware.md),
[`docs/safety.md`](docs/safety.md), [`docs/runbook.md`](docs/runbook.md),
[`docs/api.md`](docs/api.md), the [`API regulation`](API_REGULATION.md) and the
[`design system`](docs/design.md). If you need a database, see
[`docs/local-database.md`](docs/local-database.md).

## Reusing the stack

`stack/` contains a scaffold and four generators:

```bash
node stack/src/cli.mjs --target ../RoadGuard --name "RoadGuard" --slug roadguard
pnpm gen feature maintenance
pnpm gen device-route telemetry
pnpm gen firmware-module gps_quality
pnpm gen model MaintenanceLog
```

See [`stack/README.md`](stack/README.md) for what the scaffold copies, what it
rewrites and what it deliberately leaves behind.

## Deployment

The promotion path is `feature -> develop (gate) -> staging (preview) ->
versioned main`. Production deploys only from `main`; `staging` is the preview
deployment; `develop` is the integration and reconciliation gate and does not
deploy. Every other branch, including pull-request previews, is ineligible.

The firmware version is independent of the application and PWA version. Bump
`FW_VERSION` only when the firmware changes; an application release does not
force a firmware release. The version contract and the release process are in
[`docs/deployment.md`](docs/deployment.md).

```bash
node scripts/release-check.mjs
node scripts/deployment-check.mjs
```

## License

MIT. See [`LICENSE`](LICENSE) and [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).
