# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-22

### Added

- Lean vehicle-alert console: dashboard, vehicles, incidents, trackers and settings.
- Row-level security on every application table for the Supabase deployment.
- Vercel deployment allowlist: automatic deployments are restricted to `main`
  and `develop`; preview deployments from other branches are disabled. The
  allowlist is mirrored in `apps/web/vercel.json` for the monorepo root.
- Night Highway Dispatch design system: emergency signal palette, Barlow
  display/UI type, signal-plate logo, favicon and responsive console shell.
- `API_REGULATION.md`, the Next.js conformance notes and `pnpm api:latency` for
  warm-up/p95/max checks.
- Redesigned login, dashboard, incident, vehicle, tracker, settings and public
  pages; the evidence chart now renders immediately without animation.
- Device API: ingest, incident, cancel, command poll, command acknowledgement and
  signed-release OTA check.
- Prisma schema, initial migration and idempotent demo seed.
- Crash state machine, false-positive filters, countdown, cancel and retry logic.
- Native Unity tests for the Arduino-free firmware headers.
- Server/firmware configuration contract with drift detection.
- Reusable `stack/` scaffold and generators for features, device routes, firmware
  modules and Prisma models.
- Documentation: architecture, hardware, safety, API and ADRs.
- Agent foundation: root `AGENTS.md`, project OpenCode permissions, Dependabot,
  `scripts/verify.sh`, and clang-format configuration.
- Canonical firmware pin map at `firmware/include/pins.h`, with
  `firmware/main/hardware.h` aliasing it.
- `docs/wiring.md`, `docs/runbook.md` and `docs/current-state.md`.
- Deployment policy: version-consistency and Vercel-allowlist checks, a
  `Deployment policy` workflow, and `docs/deployment.md` with the release
  process and manual dashboard checklist.
- Branch protection on `main` and `develop`: pull requests, required CI
  checks, conversation resolution, no force pushes and no branch deletion.
  `main` additionally requires one approval and linear history.
- Immutable `v*` release tags via a repository ruleset.
- `stage` promotion branch: feature PRs go to `develop`, `develop` promotes to
  `stage`, and `stage` promotes a versioned release to `main`. `stage` is
  protected but is not a Vercel deployment target.
- Issue-first collaboration: issue and pull-request templates, an `Issue policy`
  CI check, and `scripts/issue-policy.mjs`.
- Mandatory overlap check against J-Akiru5's open issues and PRs before creating
  a new task.
- Multi-agent definitions for `integrator`, `release-manager` and `reviewer`,
  plus `scripts/merge-pr.mjs` and `docs/agents.md`.

### Changed

- Adopt the global API regulation: matching request IDs, `error.request_id`,
  `X-Response-Time`, 2 s hot-route timeouts, SLOW/VIOLATION logs and no-store
  device responses.
- Vercel Functions are pinned to Singapore (`sin1`) next to the Supabase
  `ap-southeast-1` pooler.
- Org settings are cached for 60 s and invalidated after a settings write; the
  device-watch cron uses batched reads/inserts instead of an N+1 loop.
- Vercel builds use `pnpm build` so `prisma generate` runs before `next build`.
- The runtime accepts the Supabase–Vercel integration names
  (`POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING`) as aliases for
  `DATABASE_URL` / `DIRECT_URL`, and `/api/health` reports which required
  environment variables are present without returning their values.
- CI runs on pushes to `main`/`develop` and on pull requests, instead of every
  branch push and the matching pull request.
- Access model reduced to three roles: `USER` (vehicle owner, scoped to their own
  vehicles), `RESPONDER` (CDRRMO / Pulis, whole-fleet incident response) and
  `ADMIN` (members, trackers and settings). Vehicles now carry an optional
  `ownerId`.
- Database hosting moved from local Docker Compose PostgreSQL to Supabase, with
  a pooled `DATABASE_URL` and a separate `DIRECT_URL` for migrations and seed.
- The ESP32 sketch is now `firmware/main/main.ino`; PlatformIO's `src_dir` and all
  tests and generators point at `firmware/main`.
- A7670E PWRKEY is treated as active LOW: probe `AT`, pulse low for 1.2 s, then
  release HIGH.
- Battery and ignition sensing are disabled by default because the wiring
  diagram does not include the dividers; enable `hw::kHasPowerSense` after
  fitting them.
- The firmware gate now runs the ESP32 build, native tests, cppcheck and
  clang-format through `scripts/verify.sh`; CI uses the same script.
- The native PlatformIO environment includes `firmware/include`, and cppcheck
  suppresses its known ArduinoJson preprocessor false positive.
- `pnpm self-check` now includes the release and deployment policy checks.
- Release promotion now runs `develop` -> `stage` -> versioned `main`; CI and
  the deployment-policy workflow also run on `stage` pushes.
- `develop` and `stage` merges are handled by the `integrator` subagent through
  `scripts/merge-pr.mjs`, which refuses `main` and unfinished checks; `main`
  remains human-merged.
- `pnpm self-check` now includes the issue-policy tests.

### Removed

- `docker-compose.yml` and the `db:up` / `db:down` scripts.

### Fixed

- Vercel allowlist used `"*": false`, which never crosses a slash, so feature
  branches such as `setup/agent-foundation` still deployed. Both configs now use
  `"**": false`, and `deployment-check.mjs` asserts that the negative glob
  matches a slash branch.

## [0.1.0] - 2026-11-18

### Added

- Initial LifeLink implementation.
