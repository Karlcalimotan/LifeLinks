# TASKS.md — shared product queue

Status values: **TODO** | **CLAIMED:<agent>** | **IN REVIEW** | **DONE**

Rule: claim a task by changing its status before starting. One task, one owner,
one branch, one PR. Commit this file with every queue change. The parent
(orchestrator) reconciles this file when branches merge; collaborators report
status and may update their own branch copy.

## Cycle 0 (one time, before the loop starts)

- [ ] **C0 CLAIMED:lead** — Baseline: design system, realistic seed, repeatable
      desktop/mobile screenshots, axe/Lighthouse checks, current-state update
      and the first scorecard. Issue #46.

## P0: Core product (start here)

- [x] **T1 DONE** — Trackers: validate MAC format, block duplicates, show clear
      form errors. Issue #38.
- [x] **T2 DONE** — Trackers: Approve / Reject / Edit / Delete actions with
      confirm dialogs and an audit log. PR #40.
- [x] **T17 DONE** — Trackers page: drawer registration, summary counts,
      combined status column, battery indicator, neutral labels and mono MACs.
      PR #49.
- [x] **T3 DONE** — Trackers: search, filter (status, vehicle, approval), sort,
      pagination. Issue #45; PR #50.
- [x] **T4 DONE** — Device ingestion API: `POST /api/device/heartbeat` and
      `/api/device/incident`, per-device auth token, idempotency key, rate
      limit, input validation (zod). Issue #37, PR #39.
- [ ] **T5 TODO** — Online/Offline logic from last heartbeat (configurable
      threshold) + low-battery flag; replace "4d ago" with live relative time.
      **Blocked on a Lead decision:** the threshold is currently a platform
      constant (`DEVICE_OFFLINE_AFTER_MIN`), not an org setting. Do not change
      the schema without that decision.
- [ ] **T6 IN PROGRESS** — Incidents: data model + workflow, GPS location on a
      map, timeline of events. The workflow, evidence chart and timeline exist.
      The list workspace is PR #73 and the live map is PR #84. Remaining:
      responder assignment and incident notes (not modelled).
- [ ] **T7 IN PROGRESS** — Alerts: notify on new incident, with retry and
      delivery status. Intake queues `AlertDelivery` rows and the notifications
      page (PR #83) shows them, but **no sender or retry worker exists**. The
      page states this plainly. Sender/provider work needs a Lead decision.
- [x] **T8 DONE** — Dashboard: live KPIs (online trackers, open incidents, low
      battery) + map of vehicles and incidents. Issue #68; PR #82. The `/map`
      page is issue #72; PR #84.
- [ ] **T9 TODO** — Realtime updates (no manual refresh) for trackers and
      incidents.
- [ ] **T10 IN PROGRESS** — Vehicles: full CRUD, owner, emergency contacts,
      assigned tracker, detail page with history. Detail tabs and maintenance
      mode are issue #76; PR #89. CRUD and per-vehicle contacts are not
      modelled.
- [ ] **T11 IN PROGRESS** — Tracker detail page: heartbeat history, battery
      trend, firmware version, last location. Connectivity, config, commands,
      events and firmware are visible. A battery trend needs a telemetry query
      and a chart; not done.
- [ ] **T12 TODO** — Roles and permissions (admin / operator / viewer) enforced
      on server AND database level. The three roles and RLS exist; the
      settings role matrix is now visible (PR #81), but operator/viewer parity
      is not complete.
- [ ] **T13 IN PROGRESS** — Settings: crash thresholds, countdown time,
      notification contacts, organization info. The tabbed workspace is PR #81;
      the notifications page is PR #83. Role editing and invitations are not
      modelled.
- [ ] **T14 IN REVIEW** — Loading, empty and error states on every page; mobile
      responsive layout. Dashboard slice #62; remaining routes are issue #79,
      PR #88.

## P1: Product depth

- [ ] **T15 TODO** — Tests for the API and workflows, error tracking,
      structured logs.
- [ ] **T16 TODO** — Firmware OTA status tracking and rollout from the Trackers
      page. The firmware marker is display-only.

## Cycle 1: prototype parity (22–23 Nov 2026)

The reference is `LifeLink_prototype.html`. Tasks below adopt its surfaces using
existing schema data. No schema, RLS or device API changes.

- [x] **T18 DONE** — Dashboard command center: KPI strip, needs-attention queue,
      schematic map, activity feed, 14-day trend. Issue #68; PR #82.
- [x] **T19 DONE** — Incidents workspace: search, status/severity/range
      filters, sort, pagination, delivery ratio, time to acknowledge. Issue #69;
      PR #73.
- [x] **T20 DONE** — Analytics page: response KPIs, daily trend, severity, top
      vehicles, hour of day, slowest responses. Issue #70; PR #80.
- [x] **T21 DONE** — Settings workspace: organization, thresholds, retention,
      members, role matrix, audit log, health. Issue #71; PR #81.
- [x] **T22 DONE** — Live map: list, search/filter, schematic positions,
      selected-vehicle panel, legend, stale-fix handling. Issue #72; PR #84.
- [x] **T23 DONE** — Command palette and incident bell: Ctrl/Cmd+K, `/`,
      authenticated search, awaiting-acknowledgement bell. Issue #74; PR #86.
- [x] **T24 DONE** — Tracker table polish: copy MAC, signal bands, firmware
      marker, combined connection, bulk approve with failed/skipped reporting.
      Issue #75; PR #87.
- [x] **T25 DONE** — Vehicle detail tabs and maintenance mode. Issue #76;
      PR #89.
- [x] **T26 DONE** — Realistic seed data for every page: 11 vehicles,
      13 trackers, 26 trips, 13 incidents across every status. Issue #77;
      PR #85. **Not executed against the configured database:** it is remote,
      so the safety guard requires explicit `SEED_DEMO=yes`. Approve that
      separately if the demo data should be replaced.
- [x] **T27 DONE** — Notifications and alert delivery page: targets, contacts,
      paginated log, honest policy summary. Issue #78; PR #83.
- [x] **T28 DONE** — Route loading and error states for the remaining routes.
      Issue #79; PR #88.

## Known gaps after Cycle 1

1. **Alert sender.** `AlertDelivery` rows are queued, not sent. There is no
   provider, retry worker or escalation engine. The notifications page and
   policy copy say so. This is the largest functional gap in the prototype
   parity batch.
2. **Incident notes, responder dispatch and per-vehicle emergency contacts.**
   The prototype shows them; the schema does not model them.
3. **Acknowledgement time.** There is no `acknowledgedAt` column. The dashboard
   and analytics derive it from `AuditLog` rows with action
   `incident.acknowledged`; seeded or pre-audit acknowledgements show `—`.
4. **T5 threshold.** The online/offline window is a platform constant. Changing
   it to an org setting is a schema decision.
5. **Firmware OTA.** The "Update available" marker is display-only.
6. **Seed execution.** The realistic seed is committed but has not been run
   against the configured Supabase project. Running it wipes and recreates the
   demo organisation's fleet and needs explicit approval.

## Ordering notes

1. T1 and T4 are done; they own different files.
2. T2 and T3 follow T1 so the tracker list/form is stable.
3. T5 follows T4; both consume the heartbeat data.
4. T6 and T7 are the next architecture tasks (incident workflow + alerts).
5. T8-T11 depend on stable tracker/incident data; T12 depends on the permission
   model; T13 depends on settings; T14 is cross-cutting.
6. T15/T16 only after P0.

## Review note

The tracker form already has a MAC regex and the device routes already have
per-device token auth and client-id idempotency. T1/T4 closed the remaining
gaps. Cycle 1 used one branch and one PR per task, with an independent Reviewer
pass before merge.
