# UI/UX review — LifeLink v0.3.0

Workbench: `UI_UX-Review-Workbench-Syntaxure-Labs.html`
Standard: WCAG 2.2 A and AA, plus practice checks
App: LifeLink crash-response console
Build: `develop@646ff5f` (production build on `localhost:3001` for the audit pass)
Reviewer: independent reviewer plus the orchestrator
Date: 2026-11-23
Roles sampled: admin, vehicle owner, responder (seeded accounts)
Devices sampled: desktop 1440×900, mobile 390×844 (screenshots)
Browser: Chromium via the in-app browser and Lighthouse
Theme: dark only by design. There is no theme control; light-mode items are
recorded as N/A with that reason.

This is a sampled manual review, not a conformance claim. A pass means no
failure was found on the screens and states sampled.

## Critical flows

| Flow | Result | Notes |
| --- | --- | --- |
| Sign in as admin and reach the dashboard | Pass | 1 step, visible labels, paste works |
| Find and acknowledge an incident | Fail on mobile | Acknowledge sits at the far right of a 960 px table; the 390 px screenshot shows no action column |
| Search and filter incidents | Pass on desktop | Filters compose; mobile needs the same table swipe |
| Register and approve a tracker | Pass with risk | Drawer works; one-time token panel lost its warning surface (missing colour tokens) |
| Open the live map and inspect a vehicle | Pass | List, markers, legend and selected panel work; map is schematic |
| Update settings | Pass with risk | Save works; the Save action is detached in a separate card |

## Checklist summary

The workbench has 79 items across nine groups. Counts below are item-level,
sampled on the screens in scope. Blank items are not passes.

| Group | Pass | Fail | N/A | Not reviewed |
| --- | --- | --- | --- | --- |
| C Colour and contrast | 5 | 3 | 1 | 0 |
| T Typography and readability | 3 | 3 | 0 | 3 |
| M Light and dark mode | 4 | 1 | 3 | 1 |
| L Layout and visual consistency | 3 | 3 | 0 | 1 |
| K Keyboard and focus | 3 | 3 | 1 | 4 |
| F Forms, feedback and errors | 5 | 4 | 1 | 3 |
| N Navigation and structure | 4 | 3 | 1 | 1 |
| R Responsive and device | 0 | 2 | 0 | 4 |
| A Assistive technology and semantics | 5 | 0 | 0 | 1 |
| **Total** | **32** | **22** | **7** | **18** |

Lighthouse accessibility, best practices and SEO are 1.0 with zero failures on
eleven routes. That is one input, not the review.

## Findings

Severity follows the workbench scale: S1 blocker, S2 major, S3 minor, S4 polish.

### S1 — Mobile table action is off-screen (T2, R2, L1)

- Evidence: `reports/screens/cycle-1/mobile/incidents.png`,
  `mobile/devices.png`; `incidents/page.tsx` uses `min-w-[960px]`,
  `devices/page.tsx` uses `min-w-[1040px]`, and the shared table only adds
  `overflow-x-auto`.
- Impact: an operator on a phone cannot see Acknowledge, status, delivery or
  battery without an undisclosed horizontal swipe. This stops the core task.
- Fix: card list below `lg`, or a pinned first column plus a sticky action cell.
  Put Acknowledge in the first cell on mobile.

### S1 — Demo admin credentials are public (security, not a WCAG item)

- Evidence: `messages/en.json` `auth.demoHint`, passed to the client provider on
  every page; README and `docs/local-database.md`.
- Impact: if the demo seed ever reached the deployed database, anyone can sign
  in as admin.
- Fix: remove the hint from the message bundle, gate it behind a server-only
  demo flag, and require a second explicit flag before a remote seed.
- Status: security PR in progress.

### S2 — Missing palette classes on token and rejection banners (C4, C7, M5)

- Evidence: `create-device-form.tsx`, `rotate-token-button.tsx`,
  `devices/[id]/page.tsx`, `incidents/[id]/page.tsx` use `clear-500/200` and
  `caution-500/200`, which are not defined in `globals.css`.
- Impact: the one-time token warning and rejection states render as plain text
  with no border or tint.
- Fix: use `clear-400/300` and `caution-400/300`; add a design-lint rule.

### S2 — Safety-critical actions fire on one click (F6)

- Evidence: Disarm, Rotate token, Mark false alarm and Cancel incident submit
  immediately; `ConfirmSubmit` already exists and is used for delete/approve.
- Impact: a misclick can disarm crash detection, invalidate a tracker or close
  an incident. "Cancel" also reads as "dismiss this form".
- Fix: confirm all four, use the existing "Mark false alarm" and "Cancel
  incident" copy.

### S2 — Navigation, focus and page titles are weaker than the visual system (K4, K6, N1, N6)

- Evidence: no skip link or `id="main"`; no `aria-current` on sidebar or mobile
  nav; inputs override the global 2 px focus ring; every route has the same
  document title; the mobile nav scrolls eight 72 px items.
- Impact: keyboard users tab through the chrome on every page, the active
  location is colour-only on mobile, and tabs/screen readers cannot distinguish
  routes.
- Fix: skip link, `aria-current="page"`, the global focus ring, per-route
  metadata, and five tabs plus a More sheet (or a labelled scroll region).

### S2 — Incident detail does not support the response (L3, N8)

- Evidence: the page queries `vehicle` but never shows `driverName` or
  `driverPhone`; there is no call link; the timeline only reads
  `DeviceStateEvent`, so acknowledgements and resolutions from `AuditLog` never
  appear.
- Impact: the operator cannot call the driver or see who acknowledged the
  incident.
- Fix: `tel:` link, map link, and merge audit transitions into the timeline.
  No schema change.

### S2 — Tagalog is mixed with English on the screens that matter (N8)

- Evidence: `connectionLabel`, `severityLabel`, `sentence` and `formatRelative`
  return English; `devices-toolbar.tsx` and both detail pages are largely
  hardcoded; 131 of 660 TL values are identical to EN.
- Impact: the language switch is misleading; status chips and badges disagree.
- Fix: pass translated labels into badges, add a locale to `formatRelative`,
  and move the remaining strings into messages.

### S2 — Vehicles is the weakest list (L3, L4)

- Evidence: no search, filter, sort, pagination or primary action; every row
  shows a green "Active" vehicle beside an offline tracker; plate links use the
  signal accent; "Last seen" has no absolute timestamp.
- Impact: unscannable at fleet scale and ambiguous status semantics.
- Fix: standard toolbar, neutral links, absolute-time hover, and either an Add
  vehicle path or copy that says where vehicles are provisioned.

### S3 — Polish that reads as unfinished (T9, L3, L5, K8)

- KPI hints truncate without a title ("0 of 1 included i…").
- Notifications opens with six implementation paragraphs; the sender gap should
  be a three-line status banner with the detail behind a disclosure.
- The register drawer has no footer or Cancel.
- The global `/` shortcut is a single-character shortcut with no off switch
  (WCAG 2.1.4).
- The dashboard Needs attention card leaves a large empty block beside the map.

### S3 — Responsive and assistive coverage is incomplete

- Only Chromium was exercised; no Firefox, Safari, Edge, real Android/iOS,
  screen reader, 200% zoom, text-spacing override, forced-colors or throttled
  network pass. These are not failures; they are not reviewed.

## Verdict

Workbench rule order:

1. An S1 blocker is open → **Reject: rework needed**.
2. Checks are not reviewed → **Incomplete**.
3. An S2 major is open → **Reject: rework needed**.

**Suggested verdict: Reject: rework needed.** Two S1 blockers are open (mobile
action visibility, demo credentials) and several S2 majors remain. The review is
also incomplete on real devices, screen readers, browsers other than Chromium,
zoom, text spacing and forced colours.

Re-review after the security and UI/UX fix PRs land. Retest each fix in both
themes; for this app that means the dark theme plus an explicit N/A note for
light.

## Evidence log

| Ref | Theme/width | File | Description |
| --- | --- | --- | --- |
| E1 | dark/1440 | `reports/screens/cycle-1/desktop/dashboard.png` | Dashboard command center |
| E2 | dark/390 | `reports/screens/cycle-1/mobile/incidents.png` | Incident table, action off-screen |
| E3 | dark/390 | `reports/screens/cycle-1/mobile/devices.png` | Tracker table, action off-screen |
| E4 | dark/1440 | `reports/screens/cycle-1/desktop/notifications.png` | Policy block and delivery log |
| E5 | dark/1440 | `reports/screens/cycle-1/desktop/settings.png` | Settings workspace |
| E6 | n/a | Lighthouse reports, 11 routes | Accessibility/best-practices/SEO 1.0 |
| E7 | n/a | `reports/cycle-1.md` | Cycle 1 scorecard and Lighthouse summary |

## What is already strong

- A real design system with measured contrast, a six-step scale and a status
  mapping.
- Clear desktop density and hierarchy; one accent; status text plus colour.
- Dashboard, incidents, trackers, map, analytics, notifications and settings
  share the same panel/table/toolbar patterns.
- Honest copy about the missing alert sender and stale GPS.
- Command palette, bell, bulk approve, copyable MACs and 1.0 automated
  accessibility on the audited routes.

## Next review

1. Re-run this checklist after the S1/S2 fixes.
2. Add the uncovered routes and states to the screenshot gate: detail pages,
   loading, empty, error, dialogs and Tagalog.
3. Add a screen-reader walk, 200% zoom, text-spacing and forced-colours pass.
4. Add Firefox, Safari and one real phone to the matrix.
