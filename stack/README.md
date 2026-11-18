# LifeLink stack

A scaffold and four generators for building another vehicle-alert project with
the same architecture.

The **reference implementation is this repository**. The scaffold copies the
current tree, excludes runtime artifacts, and rewrites the identity tokens. There
is no second copy of the template to drift out of date.

## Scaffold a new project

```bash
node stack/src/cli.mjs \
  --target ../RoadGuard \
  --name "RoadGuard" \
  --slug roadguard \
  --scope @roadguard \
  --token-prefix rg
```

Options:

| Option | Meaning |
| --- | --- |
| `--target` | New project directory (must be empty or absent) |
| `--name` | Display name, e.g. `RoadGuard` |
| `--slug` | Lowercase package/slug, e.g. `roadguard` |
| `--scope` | npm scope, e.g. `@roadguard` |
| `--token-prefix` | Device token prefix, e.g. `rg` → `rg_...` |
| `--force` | Copy over a non-empty target (does not delete files) |

The CLI never runs installs, never touches git and never writes outside the
target. It prints the first-run commands.

## What is copied

Everything that makes the project work:

- `apps/web` (Next.js console, device API, Prisma schema and seed)
- `packages/config`
- `firmware` (PlatformIO project, headers, native tests)
- `docs`, `scripts`, root config and CI-ready package scripts
- `stack` (the scaffold and generators, so `pnpm gen` works in the new project)

## What is excluded

- `node_modules`, `.next`, `coverage`, `test-results`, `playwright-report`
- `.env` and any real secret
- `pnpm-lock.yaml` (the new scope must resolve its own lockfile)
- `next-env.d.ts` (generated)
- `firmware/.pio`

## Identity tokens

| Token | Becomes |
| --- | --- |
| `LifeLink` | `--name` |
| `lifelink` | `--slug` (including the NVS namespace and the demo logins) |
| `LIFELINK` | upper-case env prefix |
| `@lifelink/` | `--scope/` |
| `llk_` | `<token-prefix>_` |
| `llk-` | `<token-prefix>-` (incident ids) |

## Generators

```bash
pnpm gen feature maintenance
pnpm gen device-route telemetry
pnpm gen firmware-module gps_quality
pnpm gen model MaintenanceLog
```

| Command | Produces |
| --- | --- |
| `feature` | Dashboard page + server action + pure schema + test |
| `device-route` | Device API route + schema + test |
| `firmware-module` | Arduino-free header + native Unity test |
| `model` | Prisma model + schema + test |

Options: `--dir <project>` (default: cwd), `--force`, `--dry-run`.

The generators are deliberately template-literal functions rather than a second
template tree. There is one source of truth: the code that ships.

## Checks

```bash
pnpm stack:check          # required files, forbidden vocabulary, contract drift
node stack/src/verify.mjs --target ../RoadGuard
```

`verify` checks:

- required files
- the server/firmware configuration contract (field keys, ranges, defaults)
- forbidden template vocabulary
- identity tokens in a generated project

It does **not** replace `pnpm test`, `pnpm build` or the hardware bench tests.

## Adapting the domain

The scaffold produces a **vehicle-alert** project. To use it for a different
purpose, change the domain pack rather than the platform shell:

1. **Prisma**: replace `Vehicle`, `Trip`, `ImpactEvent`, `TelemetrySample` with the
   new entities; keep `Organization`, `Membership`, `TrackerDevice`,
   `DeviceStateEvent` and `AuditLog`.
2. **Pages**: replace `vehicles`, `incidents` and the dashboard cards.
3. **Device API**: keep the envelope, hashed-token auth and idempotency rules;
   change the payload schemas and the write logic.
4. **Firmware**: keep `config.h`, the envelope and the native-test split; replace
   the sensor headers and the state machine.
5. **Tests**: keep the contract test and the pure-logic pattern; change the
   assertions to match the new domain.

Do not remove the device-token hashing, the idempotency keys or the audit trail;
they are the parts that make the platform safe to operate.

## After scaffolding

1. `pnpm install`, configure Supabase in `apps/web/.env`, then `pnpm prisma:deploy && SEED_DEMO=yes pnpm seed`
2. Set a real `AUTH_SECRET` and `CRON_SECRET`.
3. Change the firmware API base URL.
4. Replace the demo fleet data.
5. Run `pnpm self-check`.
6. Bench-test the cancel window, false positives, SMS and power cut.

See [`../docs/safety.md`](../docs/safety.md) for the safety contract.
