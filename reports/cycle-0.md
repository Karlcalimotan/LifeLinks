# Cycle 0 baseline — 2026-11-22

Status: **partial baseline complete; visible Trackers improvement shipped in the
same branch.** The user asked for a visible change before the 17:00 deadline, so
the baseline and the first page improvement were combined rather than stopping
after Cycle 0. The remaining baseline items are listed below.

Branch: `loop/cycle-0` · PR: #49 · Issue: #46

## What changed

- `docs/design-system.md`: direction, six-step type scale, measured contrast,
  spacing, radius/elevation, icons, component states, status mapping, responsive
  and content rules.
- Tokens: JetBrains Mono, `fog-400`, type/radius/shadow tokens; removed the
  failing `fog-600`; opaque sticky surfaces; tokenised logo, chart and toast
  colours.
- `scripts/design-lint.sh`: fails on gradients, glow, oversized radius, glass,
  marketing copy, placeholder data, arbitrary colour utilities and raw hex
  outside the documented exceptions. Result: **OK (89 files)**.
- `scripts/snapshot.mjs`: Playwright login + desktop 1440x900 / mobile 390x844
  screenshots with a console-error manifest.
- Trackers page: registration drawer, summary counts, pending callout, combined
  status column with absolute-time hover, battery bar, neutral labels, mono MACs.
- Evidence: `reports/screens/cycle-0/` — 4 screenshots, 0 console errors.

## Baseline scorecard

| Dimension | Score | Evidence |
| --- | --- | --- |
| Function | 3 | Tracker registration, approval, edit, delete, heartbeat and incident APIs work. Search/filter/sort, incident workflow and alert retry are incomplete. |
| Workflows / UX | 2 | Register/approve works, but the Trackers list has no search, filters, sort or pagination; the incident path is not end to end. |
| Visual design | 3 | New Trackers page follows the design system; other pages still carry legacy type sizes and some raw values. |
| States | 2 | Empty/error states exist in places; loading/skeleton and partial/offline states are missing on most screens. |
| Accessibility | 2 | Labels, focus ring and status text exist; axe was not installed/run; mobile table needs a pinned column or card list. |
| Responsive | 3 | Sidebar becomes bottom nav; Trackers scrolls inside its panel. Other tables still squeeze. |
| Performance | 2 | No server-side pagination; Lighthouse was not run (resource level red). |
| Backend / data | 4 | Zod validation, auth/roles, hashed device tokens, idempotency, per-device rate limits and RLS are present. |
| Reliability / observability | 3 | `/api/health`, request IDs, structured API logs and timeouts exist; alert delivery retry/status is partial. |
| Code and tests | 3 | Typed, linted, focused tests pass; new UI has no component tests yet. |

## Top five problems

1. **Trackers list has no search, filters, sort or pagination.** It will not
   scale past a demo fleet. This is T3.
2. **Incident handling is incomplete.** No end-to-end acknowledged/dispatched/
   resolved workflow, map or timeline. This is T6.
3. **Dashboard is not a live operations board.** KPIs and the vehicle/incident
   map are missing. This is T8.
4. **Seed data is still obviously fake.** `AA:BB:CC` MACs, `ABC 1234` plates and
   generic labels. The UI placeholder is fixed, but the seed rewrite is pending.
5. **States and mobile tables are inconsistent.** No skeletons on most pages;
   tables other than Trackers do not have a mobile strategy. This is T14.

## Not done in this baseline

- Full realistic seed rewrite and re-seed.
- Screenshots for Dashboard, Vehicles, Incidents, Settings and detail pages.
- axe and Lighthouse wiring (`scripts/a11y.mjs`, `scripts/lighthouse.mjs`).
- A fresh Reviewer pass.

## Production note

`develop` is the integration gate and does not deploy. Production is `main`.
PR #20 (`develop → main`) is the release vehicle; this branch must merge into
`develop` first. No Vercel deployment was triggered.
