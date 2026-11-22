# TASKS.md  (shared queue: both agents read and update this)

Status values: TODO | CLAIMED:<agent> | IN REVIEW | DONE
Rule: claim a task by changing its status BEFORE starting. One task, one owner. Commit this file on every change.

## P0: Core product (start here)
- [x] T1 DONE  Trackers: validate MAC format, block duplicates, show clear form errors
- [ ] T2 CLAIMED:collaborator  Trackers: Approve / Reject / Edit / Delete actions with confirm dialogs and an audit log
- [ ] T3 TODO  Trackers: search, filter (status, vehicle, approval), sort, pagination
- [ ] T4 TODO  Device ingestion API: POST /api/device/heartbeat and /api/device/incident, per-device auth token, idempotency key, rate limit, input validation (zod)
- [ ] T5 TODO  Online/Offline logic from last heartbeat (configurable threshold) + low-battery flag; replace "4d ago" with live relative time
- [ ] T6 TODO  Incidents: data model + workflow (New -> Acknowledged -> Dispatched -> Resolved), GPS location on a map, timeline of events
- [ ] T7 TODO  Alerts: notify on new incident (SMS/email/push), with retry and delivery status

## P1: Product depth
- [ ] T8  TODO  Dashboard: live KPIs (online trackers, open incidents, low battery) + map of vehicles and incidents
- [ ] T9  TODO  Realtime updates (no manual refresh) for trackers and incidents
- [ ] T10 TODO  Vehicles: full CRUD, owner, emergency contacts, assigned tracker, detail page with history
- [ ] T11 TODO  Tracker detail page: heartbeat history, battery trend, firmware version, last location
- [ ] T12 TODO  Roles and permissions (admin / operator / viewer) enforced on server AND database level
- [ ] T13 TODO  Settings: crash thresholds, countdown time, notification contacts, organization info
- [ ] T14 TODO  Loading, empty and error states on every page; mobile responsive layout

## P2: Hardening (only after P0 is done)
- [ ] T15 TODO  Tests for the API and workflows, error tracking, structured logs
- [ ] T16 TODO  Firmware OTA status tracking and rollout from the Trackers page

## Notes

- T1 verified done on `develop@6945ca2`: `apps/web/lib/device/validation.ts` (MAC format, label length), `apps/web/lib/actions/devices.ts` (normalize MAC, duplicate check, clear error), `apps/web/lib/device/validation.test.ts` (3 tests). No new work needed.
- T2 claimed by collaborator on `feat/t2-tracker-actions`, worktree `C:\Users\Client\LifeLink-t2-trackers`, tracking issue #36.
- T2 delete is a hard delete with a confirmation that warns trips, samples and incidents are removed. If the lead prefers a soft delete, say so here before review.
