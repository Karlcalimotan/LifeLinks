# LifeLink

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

Open http://localhost:3000 and sign in with:

```
admin@lifelink.local
Admin123!
```

The seed creates two vehicles, three trackers (one pending approval), an
incident with evidence, telemetry and an alert trail.

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
| `pnpm self-check` | Full local gate |

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
firmware/                 PlatformIO project, pure headers, native tests
docs/                     architecture, hardware, safety, API, ADRs
stack/                    reusable scaffold + generators (not copied to new projects)
```

## Documentation

Start with [`docs/architecture.md`](docs/architecture.md), then
[`docs/hardware.md`](docs/hardware.md), [`docs/safety.md`](docs/safety.md) and
[`docs/api.md`](docs/api.md). If you need a database, see
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

## License

MIT. See [`LICENSE`](LICENSE) and [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).
