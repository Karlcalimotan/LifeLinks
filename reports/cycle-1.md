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
and finds the template's old product attribution. CI runs from a clean clone and
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

## Follow-up: Lighthouse accessibility pass

Date: 2026-11-23. Tool: Lighthouse through the in-app browser, against the
production build of `fix/a11y-contrast-and-label` on `http://localhost:3001`.

| Route | Accessibility | Best practices | SEO |
| --- | --- | --- | --- |
| Dashboard | 1.0 | 1.0 | 1.0 |
| Incidents | 1.0 | 1.0 | 1.0 |
| Live map | 1.0 | 1.0 | 1.0 |
| Analytics | 1.0 | 1.0 | 1.0 |
| Settings | 1.0 | 1.0 | 1.0 |
| Trackers | 1.0 | 1.0 | 1.0 |
| Vehicles | 1.0 | 1.0 | 1.0 |
| Notifications | 1.0 | 1.0 | 1.0 |
| Vehicle detail | 1.0 | 1.0 | 1.0 |
| Incident detail | 1.0 | 1.0 | 1.0 |
| Tracker detail | 1.0 | 1.0 | 1.0 |

All eleven routes scored 1.0 with zero reported failures.

Found and fixed in the follow-up:

- Primary buttons lost `text-ink-950` because tailwind-merge classified the
  custom `text-meta`/`text-body` sizes as text colours. `cn()` now registers the
  six type-scale values as font sizes, with a table-driven regression test.
- Destructive buttons used `fog-50` on `alarm-500` (4.12:1). They now use
  `ink-950` on `alarm-400` (6.89:1).
- The header search trigger's accessible name now matches its visible label;
  the Ctrl/Cmd+K chip moved into the palette and `aria-keyshortcuts`.

The browser tool generates raw Lighthouse JSON per run; it is not committed.
This section is the durable summary.

## Repeatable axe gate

Date: 2026-11-23. Branch `chore/axe-gate` from `develop@105eb2e`. Command:
`pnpm a11y` (`node scripts/a11y.mjs`) against the local dev app at
`http://localhost:3000`, signed in as the demo admin, desktop 1440x900,
axe-core 4.14.1.

| Route | Critical | Serious | Moderate | Minor | Result |
| --- | --- | --- | --- | --- | --- |
| login | 0 | 0 | 2 | 0 | clean |
| dashboard | 0 | 0 | 1 | 0 | clean |
| incidents | 0 | 0 | 1 | 0 | clean |
| map | 0 | 0 | 1 | 0 | clean |
| analytics | 0 | 0 | 1 | 0 | clean |
| settings | 0 | 0 | 1 | 0 | clean |
| trackers | 0 | 0 | 1 | 0 | clean |
| vehicles | 0 | 0 | 1 | 0 | clean |
| notifications | 0 | 0 | 1 | 0 | clean |

All nine routes were measured; none is unmeasured. The gate exits `0`: there are
no serious or critical violations. The dashboard incident-trend chart's
horizontal scroller now has keyboard access (`bar-chart.tsx` uses a focusable
`<section>`), closing the previous `scrollable-region-focusable` finding. The
ten moderate violations are missing landmarks (`region`, plus
`landmark-one-main` on login); the login page accounts for most of the affected
nodes. They are listed in `reports/a11y/latest.md`.

The full JSON evidence is `reports/a11y/latest.json`. An unreachable app exits
`2` and writes **NOT RUN**; the gate never reports a skipped check as a pass.
The command is not wired into CI (`.github/` is out of scope), so it is the
repeatable local evidence, not a merge gate.

The Lighthouse accessibility 1.0 result above is unchanged. Lighthouse's
accessibility category and a full axe run use different rule sets; this run
reports a best-practice rule that the Lighthouse run did not.

## Scores

| Dimension | Before | After |
| --- | --- | --- |
| Function | 3 | 4 |
| Workflows / UX | 2 | 4 |
| Visual design | 3 | 4 |
| States | 2 | 4 |
| Accessibility | 2 | 4 |
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
6. The repeatable axe gate exists (`pnpm a11y`) and reports zero serious or
   critical violations on 9/9 routes; ten moderate landmark findings remain.
   Lighthouse accessibility, best practices and SEO remain 1.0 on the eleven
   audited routes. A performance benchmark and a decision on wiring axe into CI
   are still missing.
7. Two schematic map implementations exist; consolidate before they diverge.
8. The staging preview URL could not be verified from this environment.

## Next

1. Implement the alert sender and retry path (T7).
2. Decide the T5 threshold location and migrate if approved.
3. Apply the realistic seed after owner approval.
4. Decide whether the axe gate joins CI. Add a performance benchmark.
5. Consolidate the map components and add a heading from telemetry.
