# Accessibility check (axe)

Generated: 2026-11-23T13:19:31.744Z
Base URL: http://localhost:3000
Locale: en
axe: 4.14.1
Viewports: desktop 1440x900
Gate: serious and critical violations

**Result: PASS — no serious or critical violations**

Measured routes: 9 of 9.

| Viewport | Route | Critical | Serious | Moderate | Minor | Result |
| --- | --- | --- | --- | --- | --- | --- |
| desktop | login | 0 | 0 | 2 | 0 | clean |
| desktop | dashboard | 0 | 0 | 1 | 0 | clean |
| desktop | incidents | 0 | 0 | 1 | 0 | clean |
| desktop | map | 0 | 0 | 1 | 0 | clean |
| desktop | analytics | 0 | 0 | 1 | 0 | clean |
| desktop | settings | 0 | 0 | 1 | 0 | clean |
| desktop | trackers | 0 | 0 | 1 | 0 | clean |
| desktop | vehicles | 0 | 0 | 1 | 0 | clean |
| desktop | notifications | 0 | 0 | 1 | 0 | clean |

## Moderate and minor findings

- login (desktop): landmark-one-main (moderate) — 1 node(s)
- login (desktop): region (moderate) — 17 node(s)
- dashboard (desktop): region (moderate) — 1 node(s)
- incidents (desktop): region (moderate) — 1 node(s)
- map (desktop): region (moderate) — 1 node(s)
- analytics (desktop): region (moderate) — 1 node(s)
- settings (desktop): region (moderate) — 1 node(s)
- trackers (desktop): region (moderate) — 1 node(s)
- vehicles (desktop): region (moderate) — 1 node(s)
- notifications (desktop): region (moderate) — 1 node(s)

## How to reproduce

```bash
pnpm dev            # or another server at E2E_BASE_URL
pnpm a11y           # node scripts/a11y.mjs
```

The script signs in with the demo admin and never prints credentials or session cookies. `A11Y_ROUTES`, `A11Y_VIEWPORTS` and `A11Y_LOCALE` narrow a run; `E2E_BASE_URL` points it at another server.
