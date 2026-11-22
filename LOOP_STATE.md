# LOOP_STATE.md

Cycle: **0 (partial baseline, with the first visible improvement)**
Updated: 2026-11-22
Branch: `loop/cycle-0` · PR: #49 · Issue: #46
Production: unchanged until PR #20 (`develop → main`) is merged.

## Current state

- Design system: `docs/design-system.md` + tokens implemented.
- Design gate: `scripts/design-lint.sh` — **OK**.
- Screenshot gate: `scripts/snapshot.mjs` — Trackers desktop/mobile/drawer,
  0 console errors.
- Trackers page: registration drawer, summary counts, pending callout, status
  column, battery indicator, mono MACs.
- Baseline report: `reports/cycle-0.md`.
- Verification: `tsc --noEmit` exit 0; `biome check apps/web` exit 0; focused
  validation/action tests 17/17 passed; design-lint OK.

## Baseline scores

| Dimension | Score |
| --- | --- |
| Function | 3 |
| Workflows / UX | 2 |
| Visual design | 3 |
| States | 2 |
| Accessibility | 2 |
| Responsive | 3 |
| Performance | 2 |
| Backend / data | 4 |
| Reliability / observability | 3 |
| Code and tests | 3 |

## Next cycle

1. **T3** — Trackers search, filters (status, vehicle, approval), sort,
   server-side pagination, result count. Must preserve the drawer/summary/status/
   battery work from #49. Branch from the merged `develop`.
2. **T5** — online/offline and low-battery state already partly visible; add the
   configurable threshold and absolute-time tooltip everywhere.
3. **Seed** — replace the remaining `AA:BB:CC` MACs, `ABC 1234` plates and
   generic labels; verify the online/weak/offline/never-seen and incident-state
   mix.
4. **Baseline completion** — screenshots for Dashboard, Vehicles, Incidents,
   Settings and detail pages; axe + Lighthouse; fresh Reviewer pass.

## Blockers

- Production visibility requires the human merge of PR #20. Agents do not merge
  `main`.
- PR #49 must pass CI and merge into `develop` before T3 branches from it.
