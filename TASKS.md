# TASKS.md — shared product queue

Status values: **TODO** | **CLAIMED:<agent>** | **IN REVIEW** | **DONE**

Rule: claim a task by changing its status before starting. One task, one owner,
one branch, one PR. Commit this file with every queue change. The parent
(orchestrator) reconciles this file when branches merge; collaborators report
status and may update their own branch copy.

## P0: Core product (start here)

- [x] **T1 DONE** — Trackers: validate MAC format, block
      duplicates, show clear form errors. Issue #38.
- [ ] **T2 IN REVIEW** — Trackers: Approve / Reject / Edit / Delete actions with
      confirm dialogs and an audit log.
- [ ] **T3 CLAIMED:builder** - Trackers: search, filter (status, vehicle, approval), sort,
      pagination. Issue #45.
- [x] **T4 DONE** — Device ingestion API: `POST /api/device/heartbeat`
      and `/api/device/incident`, per-device auth token, idempotency key, rate
      limit, input validation (zod). Issue #37; PR pending.
- [ ] **T5 TODO** — Online/Offline logic from last heartbeat (configurable
      threshold) + low-battery flag; replace "4d ago" with live relative time.
- [ ] **T6 TODO** — Incidents: data model + workflow (New -> Acknowledged ->
      Dispatched -> Resolved), GPS location on a map, timeline of events.
- [ ] **T7 TODO** — Alerts: notify on new incident (SMS/email/push), with retry
      and delivery status.

## P1: Product depth

- [ ] **T8 TODO** — Dashboard: live KPIs (online trackers, open incidents, low
      battery) + map of vehicles and incidents.
- [ ] **T9 TODO** — Realtime updates (no manual refresh) for trackers and
      incidents.
- [ ] **T10 TODO** — Vehicles: full CRUD, owner, emergency contacts, assigned
      tracker, detail page with history.
- [ ] **T11 TODO** — Tracker detail page: heartbeat history, battery trend,
      firmware version, last location.
- [ ] **T12 TODO** — Roles and permissions (admin / operator / viewer) enforced
      on server AND database level.
- [ ] **T13 TODO** — Settings: crash thresholds, countdown time, notification
      contacts, organization info.
- [ ] **T14 TODO** — Loading, empty and error states on every page; mobile
      responsive layout.

## P2: Hardening (only after P0 is done)

- [ ] **T15 TODO** — Tests for the API and workflows, error tracking,
      structured logs.
- [ ] **T16 TODO** — Firmware OTA status tracking and rollout from the Trackers
      page.

## Ordering notes

1. T1 and T4 are in flight in parallel; they own different files.
2. T2 and T3 follow T1 so the tracker list/form is stable.
3. T5 follows T4; both consume the heartbeat data.
4. T6 and T7 are the next architecture tasks (incident workflow + alerts).
5. T8-T11 depend on stable tracker/incident data; T12 depends on the permission
   model; T13 depends on settings; T14 is cross-cutting.
6. T15/T16 only after P0.

## Review note

The current tracker form already has a MAC regex and the device routes already
have per-device token auth and client-id idempotency. T1/T4 close the remaining
gaps (duplicate handling/form errors and a dedicated heartbeat/rate-limit path)
rather than rebuilding those pieces.
