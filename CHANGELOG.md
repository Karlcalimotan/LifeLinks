# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Lean vehicle-alert console: dashboard, vehicles, incidents, trackers and settings.
- Device API: ingest, incident, cancel, command poll, command acknowledgement and
  signed-release OTA check.
- Prisma schema, initial migration and idempotent demo seed.
- Crash state machine, false-positive filters, countdown, cancel and retry logic.
- Native Unity tests for the Arduino-free firmware headers.
- Server/firmware configuration contract with drift detection.
- Reusable `stack/` scaffold and generators for features, device routes, firmware
  modules and Prisma models.
- Documentation: architecture, hardware, safety, API and ADRs.

## [0.1.0] - 2026-11-18

### Added

- Initial LifeLink implementation.
