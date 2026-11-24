# LifeLink design system

The direction follows Anthropic's public `frontend-design` guidance: ground the
work in the subject, choose one opinionated conceptual direction, make a compact
token plan, and remove anything that reads as a generic UI default.

## Direction: Night Highway Dispatch

LifeLink is not a generic fleet dashboard. It is the screen a CDRRMO/Pulis desk
and a vehicle owner look at when a crash signal arrives. The visual language
comes from the road and the dispatch desk: asphalt, reflective markings,
high-vis safety orange, emergency signal colors, ruled boards and stamped
status plates.

The one memorable motif is the **reflective edge**: a thin hazard band and a
cut corner used only on primary surfaces (login, sidebar, incident strip). The
rest of the console is quiet so the next action is the brightest thing on
screen.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| `ink-950` | `#071013` | Page canvas, asphalt |
| `ink-900` | `#0A1519` | Recessed surfaces |
| `ink-800` | `#0D1C21` | Panels and cards |
| `ink-700` | `#122A30` | Raised surfaces, borders |
| `signal-500` | `#FF5A1F` | Brand, primary action, active navigation |
| `alarm-500` | `#E5342B` | Confirmed / critical only |
| `caution-400` | `#FFB020` | Suspected, warning, degraded |
| `rescue-400` | `#45B8E8` | Acknowledged, GPS, information |
| `clear-400` | `#2FCF8F` | Online, resolved, healthy |
| `fog-100` | `#E8F1F2` | Primary text |
| `fog-300` | `#B8C9CB` | Body text |
| `fog-500` | `#8FA3A6` | Secondary labels, metadata |

Color is never the only carrier of meaning. Every status badge includes a
readable label, and the critical states also carry an icon and a rail. Signal
colors are reserved for live or actionable states; they are not decoration.

## Light mode: Daylight Dispatch

The console keeps the dark palette as its default identity and ships a matching
light palette. Both are the same token contract: the `ink` scale is the surface,
the `fog` scale is the text, and the accent `300` steps are the text-safe
accents. Filled accents (`400`/`500`), the signal plate and its dark ink stay
fixed, so status colour reads the same in both modes.

| Token | Light value | Use |
| --- | --- | --- |
| `ink-950` | `#EEF3F2` | Page canvas, cool paper |
| `ink-900` | `#E4EBEA` | Recessed surfaces |
| `ink-800` | `#FFFFFF` | Panels and cards |
| `ink-700` | `#CFDAD8` | Borders |
| `ink-600` | `#AEC0BC` | Raised borders, avatars |
| `fog-50` | `#061114` | Primary text |
| `fog-100` | `#0D2024` | Titles and body |
| `fog-300` | `#2E4447` | Body text |
| `fog-500` | `#526B6E` | Secondary labels, metadata |
| `signal-300` | `#A83405` | Active navigation, brand text |
| `alarm-300` | `#A82018` | Critical text |
| `caution-300` | `#7A4C00` | Warning text |
| `rescue-300` | `#0A6485` | Information text |
| `clear-300` | `#086348` | Healthy text |

The preference is `light`, `dark` or `system` (default). It is stored in the
`ll_theme` cookie, rendered on `<html data-theme>` on the server, and resolved
from `prefers-color-scheme` before paint for `system`. The toggle sits on the
login board and in the console header. Body text and secondary labels stay at
WCAG AA (5.0:1 or better) on both paper and panels.

## Mobile shell

Below `lg` the sidebar becomes a five-slot bottom bar: Dashboard, Live map,
Vehicles and Incidents, plus **More** for Analytics, Notifications, Trackers
and Settings. The More sheet and the account sheet (appearance, language, sign
out) are native `<dialog>` bottom sheets. Header controls are 44px on touch,
the header is one row, and `env(safe-area-inset-*)` keeps content clear of the
home indicator. Tables become card lists below `lg`; a scrollable chip row or
chart gets a solid chevron cue, not a colour fade.

## Typography

- **Display:** Barlow Condensed 600/700. Page titles, the incident count and
  large readouts. Tight leading, left aligned.
- **UI and body:** Barlow 400/500/600. Navigation, tables, forms and prose.
- **Numbers:** Barlow with `font-variant-numeric: tabular-nums` so counts and
  times do not jump.

Avoid all-caps micro-labels. Sentence case is the default; a sequence may be
numbered when it genuinely describes ordered steps (the crash path).

## Layout

```
Login
┌──────────────────────────────────────┬──────────────────┐
│ logo · crash response console        │  ┌────────────┐  │
│                                      │  │ hazard band│  │
│ The first minute                     │  │ Sign in    │  │
│ has a destination.                   │  │ email      │  │
│                                      │  │ password   │  │
│ 01 Impact   02 Confirm               │  │ [Sign in]  │  │
│ 03 Cancel   04 Alert                 │  └────────────┘  │
│ prototype note                       │  demo access   │  │
└──────────────────────────────────────┴──────────────────┘

Console
┌──────────┬───────────────────────────────────────────────┐
│ logo     │ org · role · avatar                           │
│ nav      ├───────────────────────────────────────────────┤
│          │ page title                                    │
│          │ ┌───────────────────────┐ ┌───────┬───────┐  │
│          │ │ open incidents (big)  │ │online │alerts │  │
│          │ └───────────────────────┘ └───────┴───────┘  │
│ safety   │ recent incidents board                       │
│ path     │ fleet status                                  │
└──────────┴───────────────────────────────────────────────┘
```

- Base radius is `4px`; status badges use `3px`; the primary plate uses an
  18px cut corner.
- Tables are ruled and dense. Rows gain a signal rail on hover, not a shadow.
- Panels are flat with inset highlights. No soft drop shadows and no gradient
  washes as decoration.
- Alignment is left. The console max width is 1440px.

## Logo

The mark is a **signal plate**: a safety-orange plate with a cut top-right
corner, an ink pulse that also forms the letter L, and a white beacon square at
the end of the pulse. The plate reads at 16px as an orange tile; the pulse and
beacon read at 24px and above. It is deliberately not a medical cross and not a
generic location pin.

The wordmark is set in Barlow Condensed 600. The mark carries the color; the
wordmark stays in one tone.

## Motion and accessibility

- One load sequence on the login board; one slow beacon pulse on the logo.
- `prefers-reduced-motion` disables both.
- Visible focus rings in safety orange.
- Text contrast targets WCAG AA; status meaning is duplicated in text and icons.
- The console is usable at 360px; the sidebar becomes a bottom bar.

## Copy rules

- Name the user's task, not the system: "Sign in", "Open incident board",
  "Register a tracker".
- Errors say what happened and what to do next. They do not apologize.
- Empty states invite the next action.
