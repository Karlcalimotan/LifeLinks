# LOOP_STATE.md

Cycle: **1 (prototype parity)**
Updated: 2026-11-23
Branch: `integration/prototype-parity` → `develop` PR #90; `staging` promotion PR #91
Production: unchanged. The staging preview is merged; `main` is not promoted.

## Current state

- Design system: `docs/design-system.md` + tokens implemented. New surfaces
  use the existing tokens; no new palette or type sizes.
- Design gate: `scripts/design-lint.sh` — **OK** (emoji `grep -P` check skipped
  on this host, not failed).
- Screenshot gate: `scripts/snapshot.mjs` — 20 screenshots at 1440×900 and
  390×844 for login, dashboard, map, vehicles, incidents, trackers, analytics,
  notifications and settings, plus the tracker drawer. Manifest reports **0
  console errors**. Output: `reports/screens/cycle-1/`.
- Verification on `develop@d1f8f6d`: release check, deployment policy, 35
  policy tests, Biome, TypeScript, **266 unit tests** and the production build
  all pass.
- `pnpm self-check` in the main checkout trips the stack contract on the
  template's `OptiFeed` attribution inside stale `.worktrees/` copies. CI runs
  from a clean clone and passes; this is a local-worktree artifact, not a code
  failure.

## Baseline → Cycle 1 scores

| Dimension | Cycle 0 | Cycle 1 | Evidence |
| --- | --- | --- | --- |
| Function | 3 | 4 | Dashboard queue, incident workspace, map, analytics, notifications and vehicle tabs use real queries. Alert sending is still absent. |
| Workflows / UX | 2 | 4 | Acknowledge from the dashboard or filtered list, global search, map selection, tracker bulk approve. |
| Visual design | 3 | 4 | Consistent panels, dense tables and one accent; screenshots at both widths. |
| States | 2 | 4 | Loading/error boundaries on every route; empty states for every panel. |
| Accessibility | 2 | 3 | Labels, focus trap, keyboard palette, status text plus colour. No axe run yet. |
| Responsive | 3 | 3 | 390 px screenshots; tables scroll inside panels; bottom nav scrolls. No page-level horizontal scroll observed. |
| Performance | 2 | 3 | Production build passes; no Lighthouse run. Lists are paginated. |
| Backend / data | 4 | 4 | Scoped queries, no schema or device API changes, bounded pagination. |
| Reliability / observability | 3 | 3 | Health endpoint and device watch exist; no alert sender or retry worker. |
| Code and tests | 3 | 4 | 266 tests, shared analytics aggregates, pure query/projection helpers. |

## Shipped in Cycle 1

- Dashboard command center: six KPIs, needs-attention queue, schematic fleet
  map, activity feed, 14-day trend.
- Incidents workspace: search, status/severity/range filters, sort, pagination,
  delivery ratio and time to acknowledge.
- Analytics: response KPIs, daily trend, severity, top vehicles, hour of day,
  slowest responses.
- Settings workspace: organisation, thresholds, retention, members, role
  matrix, audit log, health.
- Live map with navigation, filters, legend, selected-vehicle panel and stale
  fix handling.
- Command palette and incident bell.
- Tracker table polish: copy MAC, signal bands, firmware marker, bulk approve
  with approved/skipped/failed reporting.
- Vehicle detail tabs and audited maintenance mode.
- Notifications and alert-delivery page with an honest policy summary.
- Realistic demo seed and route loading/error states.
- `TASKS.md` and `CHANGELOG.md` updated for the batch.

## Reviewer findings fixed

- Dashboard acknowledgement KPI scoped before the audit query, earliest-wins
  semantics shared with analytics, duplicate chart/metrics removed.
- Incident acknowledge returns to the filtered list and the action accepts a
  safe `returnTo`.
- Bulk approval separates database failures from skipped trackers.
- Signal bands renamed Strong/Good/Fair/Poor so they cannot be confused with
  the heartbeat "Weak signal" state.
- Palette page index covers every nav destination; dialog uses `showModal()`;
  results are pluralised.
- Map markers follow the active filter, the search has a visible label, the
  duplicate `/` shortcut is gone, and the stale-fix and low-battery rules match
  the tracker list.

## Blockers

- **Staging preview verification.** The `staging` merge is complete and CI is
  green, but this environment has no Vercel CLI, project link or GitHub
  deployment entry, so the preview URL/status could not be verified here. Check
  the Vercel dashboard.
- **Realistic seed not applied.** The configured database is remote and the
  seed guard requires `SEED_DEMO=yes`. Running it wipes and recreates the demo
  organisation's fleet; that needs owner approval.
- **Release #65** is still waiting for the required approval and the owner's
  squash merge/tag. Agents do not merge `main` or create release tags.
- **Alert sender** is not implemented. `AlertDelivery` rows stay queued until a
  sender exists; the notifications page says so.

## Next cycle

1. **T7 alert sender** with provider credentials, retry/backoff and delivery
   status updates. This is the largest functional gap.
2. **T5 configurable online/offline threshold** after the Lead decides whether
   it belongs in `OrgSettings` (schema change).
3. **T11 tracker battery trend** from `TelemetrySample`, and a heading value on
   the map panel from the latest sample.
4. **Seed execution** once the owner approves replacing the demo fleet.
5. **Axe + Lighthouse** on dashboard, incidents, map and analytics; close the
   remaining accessibility and performance evidence gaps.
6. **Consolidate the two schematic map implementations** (`components/map/
   fleet-map.tsx` and `components/map/schematic-map.tsx`) before they diverge
   further.
