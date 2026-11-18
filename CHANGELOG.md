# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Lean vehicle-alert console: dashboard, vehicles, incidents, trackers and settings.
- Row-level security on every application table for the Supabase deployment.
- Device API: ingest, incident, cancel, command poll, command acknowledgement and
  signed-release OTA check.
- Prisma schema, initial migration and idempotent demo seed.
- Crash state machine, false-positive filters, countdown, cancel and retry logic.
- Native Unity tests for the Arduino-free firmware headers.
- Server/firmware configuration contract with drift detection.
- Reusable `stack/` scaffold and generators for features, device routes, firmware
  modules and Prisma models.
- Documentation: architecture, hardware, safety, API and ADRs.

### Changed

- Database hosting moved from local Docker Compose PostgreSQL to Supabase, with
  a pooled `DATABASE_URL` and a separate `DIRECT_URL` for migrations and seed.
- The ESP32 sketch is now `firmware/main/main.ino`; PlatformIO's `src_dir` and all
  tests and generators point at `firmware/main`.
- A7670E PWRKEY is treated as active LOW: probe `AT`, pulse low for 1.2 s, then
  release HIGH.
- Battery and ignition sensing are disabled by default because the wiring
  diagram does not include the dividers; enable `hw::kHasPowerSense` after
  fitting them.

### Removed

- `docker-compose.yml` and the `db:up` / `db:down` scripts.

## [0.1.0] - 2026-11-18

### Added

- Initial LifeLink implementation.
