# Cycle 1 report — prototype parity

Date: 2026-11-23
Reference: `LifeLink_prototype.html`
Integration branch: `integration/prototype-parity` (PR #90)
Staging: PR #91
Develop: `d1f8f6d`

## Objective

Adopt the prototype's operational surfaces using the existing schema, without
changing the database, RLS, auth or device API. One task per branch and issue,
an independent reviewer pass, then one integration PR into `develop` and a
promotion to `staging`.

## Shipped

| Surface | Issue | PR / integration |
| --- | --- | --- |
| Dashboard command center | #68 | #82 |
| Incidents workspace | #69 | #73 |
| Analytics | #70 | #80 |
| Settings workspace | #71 | #81 |
| Live map | #72 | #90 |
| Command palette and bell | #74 | #90 |
| Tracker table polish | #75 | #87 |
| Vehicle detail tabs | #76 | #90 |
| Realistic seed | #77 | #90 |
| Notifications page | #78 | #90 |
| Route loading/error states | #79 | #90 |

The integration PR also carries the shared `returnTo` action contract, the
shared analytics aggregate helpers, the full navigation (Map, Analytics,
Notifications), and the queue/changelog/design-system/snapshot updates.

## Verification evidence

Commands run on `develop@d1f8f6d`:

| Gate | Result |
| --- | --- |
| `node scripts/release-check.mjs` | PASS (app 0.2.0, firmware 0.2.0) |
| `node scripts/deployment-check.mjs` | PASS (allowlist, no extra deploy pathway) |
| `node --test scripts/issue-policy.test.mjs scripts/merge-pr.test.mjs` | 35 passed |
| `pnpm lint` | PASS, no fixes |
| `pnpm typecheck` | PASS |
| `pnpm test` | 266 passed, 7 skipped |
| `pnpm build` | PASS, 29 routes including `/map`, `/analytics`, `/notifications`, `/api/search` |
| `node scripts/seed-check.mjs` | PASS, no placeholder data in the seed |
| `node scripts/snapshot.mjs` | 20 screenshots, 0 console errors |

The local `pnpm self-check` stack-contract step scans stale `.worktrees` copies
and finds the template's `OptiFeed` attribution. CI runs from a clean clone and
passes; the failure is local-worktree pollution, not a code defect.

## Review

Two independent read-only reviewer sessions checked the nine PRs against
`IMPROVEMENT_LOOP.md` sections 6–8. Verdicts after fixes:

- PASS: analytics, settings, notifications, seed, vehicle tabs, dashboard,
  tracker polish, incidents (after the `returnTo` dependency was satisfied).
- Fixed before merge: dashboard ack KPI scoping and duplicate chart/metrics;
  incident filter-preserving acknowledge, aria-sort and page clamp; tracker
  failed-vs-skipped reporting and RSSI naming; palette page index and dialog
  modality; map filter/label/error-link behavior; notification policy wording;
  skeleton shapes; unused helpers and hardcoded copy.

## Screenshots

`reports/screens/cycle-1/{desktop,mobile}/`:

- login, dashboard, map, vehicles, incidents, trackers, analytics,
  notifications, settings
- tracker registration drawer

The full-page mobile screenshot places the fixed bottom navigation at the
initial viewport edge; that is a capture artifact, not a layout overlap. The
page reserves bottom padding.

## Scores

| Dimension | Before | After |
| --- | --- | --- |
| Function | 3 | 4 |
| Workflows / UX | 2 | 4 |
| Visual design | 3 | 4 |
| States | 2 | 4 |
| Accessibility | 2 | 3 |
| Responsive | 3 | 3 |
| Performance | 2 | 3 |
| Backend / data | 4 | 4 |
| Reliability / observability | 3 | 3 |
| Code and tests | 3 | 4 |

## Remaining gaps

1. No alert sender, retry worker or escalation engine; delivery rows stay
   queued. The notifications page states this plainly.
2. No `acknowledgedAt` column; acknowledgement time is derived from
   `AuditLog`. Seeded/pre-audit acknowledgements show `—`.
3. T5 threshold is still a platform constant, not an org setting.
4. Firmware OTA is a display marker only.
5. The realistic seed is committed but not applied to the remote demo database.
6. Axe and Lighthouse were not run; accessibility and performance remain at 3.
7. Two schematic map implementations exist; consolidate before they diverge.
8. The staging preview URL could not be verified from this environment.

## Next

1. Implement the alert sender and retry path (T7).
2. Decide the T5 threshold location and migrate if approved.
3. Apply the realistic seed after owner approval.
4. Add axe/Lighthouse to the repeatable check.
5. Consolidate the map components and add a heading from telemetry.
