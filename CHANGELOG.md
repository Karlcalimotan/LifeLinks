# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Firmware: dedicated WiFi and factory reset buttons on GPIO 13/14, aligned pin
  map and provisioning tests (#107).
- Tracker detail: an admin WiFi setup panel with the AP name derived from the
  MAC, the current setup state, the GPIO 13/14 reset instructions and a
  rotate-and-show token action (#43).
- A repeatable axe accessibility gate (`pnpm a11y`) with JSON and Markdown
  evidence; the dashboard chart scroller is keyboard accessible (#46).
- Operator false alarm and cancel after dispatch now queue a `CANCEL_ALERT`
  command carrying the device client incident id (`llk-...`). The incident
  detail shows "Cancel requested, waiting for tracker", retries when the
  command expires, and the stored command row keeps the server
  `impactEventId` (#9).
- Per-tracker firmware configuration overrides for the six server-driven
  fields, with shared envelope validation, a `SET_CONFIG` push, before/after
  audit and a pending/confirmed state driven by the device's echoed
  `config_rev` (#44).
- Bureau acknowledgement for dispatched incidents: `ACK_INCIDENT` carries the
  device client incident id and the command row keeps the server
  `impactEventId`, `ackRequestedAt` records the request, and the incident
  becomes `ACKNOWLEDGED` only when the tracker confirms. The detail shows
  "Alarm latched, waiting for tracker", reports `unknown_incident`, retries an
  expired command, and a latched device incident must be acknowledged before
  it can be resolved (#105).

### Changed

- `CANCEL_ALERT` acknowledgements decide the incident: only `cancelled` sets
  `FALSE_ALARM`. `too_late`, `unknown_incident`, a missing detail, an expired
  command or a failed command keep the status and record the reason. A
  `CANCELLED` incident and an incident with a recorded resolution are not
  overwritten, and legacy local false-alarm/cancel transitions are refused for
  live incidents so the tracker is not bypassed (#9).

## [0.3.0] - 2026-11-23

### Added

- Trackers page redesign: a registration drawer, fleet summary, pending-approval
  callout, combined status column with exact-time hover, battery threshold bar,
  neutral labels and monospaced MAC addresses.
- Tracker search, filters, sortable columns and server-side pagination (20 per
  page), including empty and clear-filter states.
- Design-system contract and tokens: JetBrains Mono for machine data, a six-step
  type scale, radius and shadow tokens, measured contrast, component states and
  `scripts/design-lint.sh`.
- Dashboard loading, error and type-scale states.
- WiFi provisioning portal and runtime provisioning on the tracker firmware.
- Firmware: queue configuration changes until idle and expose serial
  configuration controls (#66).
- Dashboard command center: six scoped KPIs, a needs-attention queue with
  inline acknowledge, an offline schematic fleet map, a recent-activity feed
  and a 14-day incident trend.
- Incidents workspace: search across plate, driver, incident id and
  coordinates; status chips with counts; severity and date-range filters;
  sortable detected column; server-side pagination; alert-delivery ratio and
  time to acknowledge per row.
- Analytics page: incidents, real crashes, false-alarm rate, acknowledgement
  and resolve time, daily trend, severity distribution, top vehicles,
  hour-of-day and slowest acknowledgements.
- Settings workspace: organization, crash thresholds, retention, members and
  role matrix, paginated audit log and read-only health counts.
- Live map page: vehicle list, search and status filters, schematic positions,
  selected-vehicle panel, legend and stale-fix handling.
- Command palette (Ctrl/Cmd+K and `/`) with authenticated, scoped search, and a
  header bell for incidents awaiting acknowledgement.
- Tracker table polish: copyable MAC addresses, signal bands, firmware update
  marker, combined connection detail and bulk approve with separate
  approved/skipped/failed reporting.
- Vehicle detail tabs (overview, trips, incidents, settings) and an audited
  maintenance-mode action.
- Notifications page: alert targets, emergency contacts, paginated delivery log
  and a policy summary that matches the implemented intake behaviour.
- Realistic demo seed: 11 vehicles, 13 trackers, 26 trips, telemetry, device
  events and 13 incidents across every workflow status.
- Route-level loading skeletons and error boundaries for vehicles, incidents,
  trackers and settings.
- Mobile card lists for incidents and trackers, so Acknowledge and Approve stay
  visible at 390 px without a horizontal table swipe.

### Changed

- Tracker registration moved from a full-width page panel to a right-side drawer
  on desktop and a full-width sheet on mobile.
- Dashboard and analytics now share the Manila day bucketing, acknowledgement
  sampling and duration formatting in `lib/analytics`.
- Incident transitions accept an optional `returnTo` so acknowledging from the
  dashboard or the filtered incident list returns the operator to that view.
- The tracker signal bands are named Strong, Good, Fair and Poor, so they no
  longer collide with the heartbeat connection state "Weak signal".
- The header search trigger shows the word Search; the Ctrl/Cmd+K hint moves to
  the palette and the button's `aria-keyshortcuts`.
- Incident detail now shows the driver call link, a map link and the
  acknowledgement/resolution audit events in the timeline.
- Disarm, Rotate token, Mark false alarm and Cancel incident ask for
  confirmation. The console has a skip link, `aria-current` navigation and
  per-route page titles.
- Notifications leads with a "Sender not connected" banner; the dashboard hint
  says alert rows are queued, not delivered.

### Fixed

- Low-battery detection now uses the 12 V tracker threshold (11.5 V) instead of
  the single-cell voltage value.
- The Trackers table preserves the current filters when sorting or paging.
- Dashboard acknowledgement KPI is scoped before the audit query and uses the
  same earliest-acknowledgement semantics as analytics.
- Bulk tracker approval reports database failures separately from trackers that
  were no longer pending, instead of counting both as skipped.
- Copy MAC controls and route error copy are translated and distinguish each
  row.
- Primary buttons keep the dark ink text colour at the design-system contrast
  ratio. Custom type-scale utilities are now classified as font sizes by
  `tailwind-merge`, so a colour such as `text-ink-950` is no longer dropped when
  combined with `text-body` or `text-meta`.
- Destructive buttons use dark ink text on the lighter alarm fill, raising the
  contrast from 4.12:1 to 6.89:1.
- The command-palette trigger's accessible name matches its visible label.
- The one-time tracker token, rejection and incident banners use defined
  palette tokens; the design linter rejects the old non-existent classes.
- Inputs keep the global 2 px focus ring, and KPI hints wrap instead of
  truncating.

### Security

- The device cancel endpoint enforces the server-side countdown and audits late
  attempts; command, acknowledgement, cancel and search have rate limits and
  the in-process bucket map is pruned and capped.
- Demo account credentials are no longer in the message bundle or the client
  payload. The login hint is server-gated to development/test, and a non-local
  seed requires both `SEED_DEMO=yes` and `SEED_ALLOW_REMOTE=yes`.
- Production sessions fail closed without a 32-byte `AUTH_SECRET`; HTTPS
  deployments set the Secure cookie. `/api/health` no longer discloses
  configuration presence, and device evidence/meta JSON is capped at 32 keys
  and 8 KiB.
- The privacy notice now states that retention is configurable but automatic
  deletion is not yet enabled, instead of promising a job that does not exist.


## [0.2.0] - 2026-11-22

### Added

- Lean vehicle-alert console: dashboard, vehicles, incidents, trackers and settings.
- Row-level security on every application table for the Supabase deployment.
- Per-organization RLS policies with a non-owner verification role and test.
  CI runs the test against a disposable Postgres service.
- Vercel deployment allowlist: automatic deployments are restricted to `main`
  (production) and `staging` (preview); `develop` is integration only and does
  not deploy. Preview deployments from every other branch are disabled. The
  allowlist is mirrored in `apps/web/vercel.json` for the monorepo root.
- Night Highway Dispatch design system: emergency signal palette, Barlow
  display/UI type, signal-plate logo, favicon and responsive console shell.
- `API_REGULATION.md`, the Next.js conformance notes and `pnpm api:latency` for
  warm-up/p95/max checks.
- Redesigned login, dashboard, incident, vehicle, tracker, settings and public
  pages; the evidence chart now renders immediately without animation.
- Device API: ingest, incident, cancel, command poll, command acknowledgement and
  signed-release OTA check.
- Dedicated `/api/device/heartbeat` endpoint with optional `Idempotency-Key` and
  per-device rate limits for heartbeat, ingest and incident.
- Tracker registration now normalizes MAC addresses, blocks duplicates with a
  field-level error, preserves submitted values and reports vehicle-scope errors.
- Tracker detail: edit the label and vehicle, confirm approve/reject/delete, and
  audit every action.
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
- Branch protection on `main`, `staging` and `develop`: pull requests, required
  CI checks, conversation resolution, no force pushes and no branch deletion.
  `main` additionally requires one approval and linear history.
- Immutable application (`v*`) and firmware (`fw-v*`) release tags via a
  repository ruleset.
- Staging promotion: feature PRs go to `develop` (the reconciliation gate),
  `develop` promotes to `staging` (the preview deployment), and `staging`
  promotes a versioned release to `main`. `develop` is protected but is not a
  Vercel deployment target.
- Issue-first collaboration: issue and pull-request templates, an `Issue policy`
  CI check, and `scripts/issue-policy.mjs`.
- Mandatory overlap check against J-Akiru5's open issues and PRs before creating
  a new task, with a `pnpm overlap:check` preflight. On an overlapping decision,
  J-Akiru5's decision takes priority.
- Multi-agent definitions for `integrator`, `release-manager` and `reviewer`,
  plus `scripts/merge-pr.mjs` and `docs/agents.md`.

### Changed

- Application `orgId` filters and role checks are documented as the authoritative
  tenant boundary; RLS is defense-in-depth for non-owner roles.
- Deployment role swap: `staging` is the preview deployment and `develop` is the
  reconciliation gate. `develop` no longer deploys, and the earlier `stage`
  branch is retired.
- Firmware versioning is independent of the application and PWA version.
  `release-check.mjs` validates the two firmware sources against each other but
  no longer against `package.json`; an application release does not force a
  firmware bump.

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
- CI runs on pushes to `main`, `develop` and `staging`, and on pull requests,
  instead of every branch push and the matching pull request.
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
- `develop` and `staging` merges are handled by the `integrator` subagent through
  `scripts/merge-pr.mjs`, which refuses `main` and unfinished checks; `main`
  remains human-merged.
- `pnpm self-check` now includes the issue-policy tests.
- Hardened the integrator merge helper against base/head races and unreadable
  check lists; narrowed the reviewer and release-manager permissions; the issue
  policy now runs from the trusted base branch.

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
