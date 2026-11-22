# LifeLink design system

Status: Cycle 0 baseline, 2026-11-22. This document is the contract for every
screen and every PR. The executable source of truth for tokens is
[`apps/web/app/globals.css`](../apps/web/app/globals.css); this file explains how
to use them. It distils the direction in [`design.md`](design.md) and does not
replace the firmware documentation.

## Direction: Night Highway Dispatch

LifeLink is the screen a CDRRMO/Pulis desk and a vehicle owner look at when a
crash signal arrives. The visual language comes from the road and the dispatch
desk: asphalt, reflective markings, high-vis safety orange, emergency signal
colours, ruled boards and stamped status plates.

The one memorable motif is the **reflective edge**: a thin hazard band and a
cut corner used only on primary surfaces (login, sidebar, incident strip). The
rest of the console is quiet so the next action is the brightest thing on
screen. This is an operations tool, not a marketing page.

## Colour

Colour is a signal, not decoration. The accent is reserved for the primary
action and active navigation. Status colours appear only on status elements
(badges, rails, charts, alerts). Every status also carries a text label, and
critical states carry an icon or rail, so colour is never the only carrier.

| Token | Value | Use |
| --- | --- | --- |
| `ink-950` | `#071013` | Page canvas, asphalt |
| `ink-900` | `#0A1519` | Recessed surfaces |
| `ink-800` | `#0D1C21` | Panels and cards |
| `ink-700` | `#122A30` | Raised surfaces, panel borders |
| `ink-600` | `#1A3A42` | Control borders, hover surfaces |
| `fog-50` | `#F4FBFC` | Highest-emphasis text, inverse text |
| `fog-100` | `#E8F1F2` | Primary text |
| `fog-300` | `#B8C9CB` | Body text |
| `fog-400` | `#A7B9BB` | Secondary labels |
| `fog-500` | `#8FA3A6` | Metadata, helper text, table headers |
| `signal-500` | `#FF5A1F` | Brand, primary action, active navigation |
| `signal-400` | `#FF7A45` | Primary hover, focus ring |
| `signal-300` | `#FFA07A` | Active navigation text on dark |
| `alarm-500` | `#E5342B` | Critical state rails and backgrounds |
| `alarm-400` | `#FF6B61` | Critical hover |
| `alarm-300` | `#FFA39E` | Critical text |
| `caution-400` | `#FFB020` | Warning, suspected, degraded |
| `caution-300` | `#FFD27A` | Warning text |
| `rescue-400` | `#45B8E8` | Information, GPS, acknowledged |
| `rescue-300` | `#9BDCF5` | Information text |
| `clear-400` | `#2FCF8F` | Online, resolved, healthy |
| `clear-300` | `#8CE9C6` | Success text |

Measured contrast (WCAG 2.1, sRGB):

| Pair | Ratio | Result |
| --- | --- | --- |
| `fog-100` on `ink-950` | 16.75:1 | AAA |
| `fog-300` on `ink-950` | 11.22:1 | AAA |
| `fog-400` on `ink-950` | 9.43:1 | AAA |
| `fog-500` on `ink-950` | 7.28:1 | AAA |
| `fog-500` on `ink-800` | 6.60:1 | AA |
| `fog-500` on `ink-700` | 5.69:1 | AA |
| `ink-950` on `signal-500` | 6.16:1 | AA |
| `signal-300` on `ink-950` | 9.67:1 | AAA |
| `alarm-300` on `ink-950` | 10.05:1 | AAA |
| `caution-300` on `ink-950` | 13.50:1 | AAA |
| `rescue-300` on `ink-950` | 12.77:1 | AAA |
| `clear-300` on `ink-950` | 13.35:1 | AAA |

Rules:

- `alarm-500` is 4.45:1 on `ink-950`: use it for rails and fills, never for
  small text. Use `alarm-300` for critical text.
- Never put text directly on a photograph or an arbitrary colour. Use a surface
  token.
- No raw hex values outside `globals.css`, the web manifest, the global error
  page (which must render without the app stylesheet) and the PWA theme colour.
- `fog-600` was removed: it measured 4.30:1 on `ink-950` and failed the text
  contract.

## Typography

Three families, one job each:

| Role | Family | Weights | Use |
| --- | --- | --- | --- |
| Display | Barlow Condensed | 600, 700 | Page titles, large numeric readouts |
| UI and body | Barlow | 400, 500, 600 | Navigation, tables, forms, prose |
| Machine data | JetBrains Mono | 400, 500 | MAC addresses, IDs, coordinates, raw timestamps |

Barlow and Barlow Condensed are the same superfamily; the condensed cut is a
display voice, not a second UI font.

### Scale

Six sizes. New and touched screens use these tokens, not arbitrary pixel values.

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `text-meta` | 12 px | 1.45 | Badges, table headers, helper text, metadata |
| `text-body` | 14 px | 1.5 | Body, forms, table cells, navigation |
| `text-emphasis` | 16 px | 1.45 | Card titles, emphasised values |
| `text-section` | 20 px | 1.3 | Section headings, empty-state titles |
| `text-title` | 30 px | 1.05 | Page titles, KPI values |
| `text-display` | 36 px | 0.95 | Login hero, the one large display moment |

- Sentence case by default. No all-caps labels; a short status badge may be
  sentence case too.
- Numbers use `tabular-nums` so counts and times do not jump.
- Machine data uses `font-mono`, uppercase MAC addresses grouped with colons.
- Existing screens still contain 10, 11, 18, 24, 60 and 72 px values. They are
  debt: converge them to the scale as each page is touched. Do not add new
  sizes.

## Spacing

4 px base. Use the Tailwind scale: `0`, `0.5` (2 px optical), `1` (4), `1.5`
(6 px optical), `2` (8), `3` (12), `4` (16), `5` (20), `6` (24), `8` (32),
`10` (40), `12` (48).

- Page padding: 16 px mobile, 24 px desktop.
- Panel padding: 20 px. Section gap: 24 px.
- Table cell: 12 px vertical, 16 px horizontal.
- Form field gap: 6 px label-to-control, 16 px between fields.
- `0.5`/`1.5` are only for optical alignment of an icon or a label; they are not
  layout spacing.
- No arbitrary spacing (`p-[13px]`, `gap-[7px]`). If the scale does not fit, the
  layout is wrong.

## Radius and elevation

| Token | Value | Use |
| --- | --- | --- |
| `rounded-control` | 3 px | Inputs, selects, badges, small icon plates |
| `rounded-panel` | 4 px | Buttons, cards, tables, panels |
| `rounded-overlay` | 6 px | Drawers, modals, toasts |
| cut corner | 18 px | Primary plate and login only |

- Borders do most of the work. Panels are flat with the `card-sheen` inset
  highlight (`--shadow-panel`).
- At most two shadow levels: the inset panel highlight and
  `--shadow-overlay` for a drawer/modal. No glow, no coloured shadow, no
  `shadow-2xl`.
- No glassmorphism. Sticky surfaces are opaque; a scrim is used behind overlays,
  not blur.

## Icons

- Lucide only. No emoji, no mixed icon sets, no decorative blobs.
- 16 px (`size-4`) inline: buttons, navigation, table metadata, badges.
- 20 px (`size-5`) standalone: empty states and stat-card marks.
- Decorative icons are `aria-hidden`; a control whose only label is an icon
  gets an `aria-label`.
- Icons follow the text colour. Status colour comes from the badge, not a
  recoloured icon.

## Components and states

Every interactive component must implement: default, hover, focus-visible,
disabled. Forms also need loading and error. Lists also need loading, empty and
error. Destructive actions require confirmation and an audit entry.

| Component | Rules |
| --- | --- |
| **Button** | `primary` (signal fill, ink text), `secondary` (ink-700 fill), `ghost`, `destructive` (alarm fill), `outline`. Sizes: 32 / 40 / 44 px high. One primary action per screen. Loading shows a spinner and keeps the label; disabled while pending. Never use signal orange for a secondary action. |
| **Input / Select / Textarea** | 40 px high, `rounded-control`, `ink-950/70` fill, `ink-600` border. Focus: signal border plus 1 px ring. Error: alarm border, `aria-invalid`, `aria-describedby`, error text `text-meta` in `alarm-300` with `role="alert"`. Labels are always visible; placeholders are examples, never labels. Helper text is `fog-500`. |
| **Badge** | Tones: neutral, success, warning, danger, info, muted. 3 px radius, `text-meta`, dot plus label. A badge is not the only carrier of status; the row or column text must also say what it means. |
| **Table** | Dense 12/16 px cells, `text-meta` headers in `fog-500`, `text-body` cells, tabular numbers, mono for MAC/IDs. Header is sticky within a scrolling panel. Row hover uses the signal rail, not a shadow. Selected row is a distinct ink step. Actions sit at the end. Empty, loading and error states are mandatory. On mobile, scroll horizontally with a pinned first column or use a card list; no page-level horizontal scroll. |
| **Card** | Flat `card-sheen` panel with an `ink-700` border. Header 20/12 px, title `text-emphasis`, description `text-meta` in `fog-500`. No cards inside cards. |
| **Drawer** | Right side, 400 px desktop, full width mobile, scrim, focus trap, Esc closes, title and description, sticky footer with Cancel and one primary action. Used for register/edit forms so they do not consume the page. |
| **Modal** | Centred, max 480 px, scrim, focus trap, Esc closes. For destructive confirmation and short decisions, not long forms. |
| **Toast** | Sonner, top-right, 4 s, success/error/info. One toast per action. A form error must still appear inline; a toast is not the only error channel. |
| **Empty state** | One sentence naming the reason and one primary action. Example: “No trackers match this filter. Clear filters.” No illustration. |
| **Skeleton** | Mirrors the final layout (rows, columns, card blocks). No spinner-only page. Respects reduced motion. |
| **Tooltip** | Hover and focus, 300 ms delay, `text-meta`, `ink-800` surface, `ink-600` border. Never the only place critical information lives. |
| **Stat card** | Label `text-meta`, value `text-title` tabular, hint `text-meta`, optional top rail in the status tone. |
| **Page header** | Title `text-title`, subtitle `text-body` in `fog-500`, actions on the right. The primary action is unmistakable. |

### Status mapping

| Domain | Value | Tone | Label |
| --- | --- | --- | --- |
| Tracker connection | online | clear | Online |
| | weak | caution | Weak signal |
| | offline | alarm | Offline |
| | never seen | muted | Never seen |
| Tracker signal (RSSI) | strong (above −70 dBm) | clear | Strong |
| | good (−79 to −70 dBm) | clear | Good |
| | fair (−89 to −80 dBm) | caution | Fair |
| | poor (−90 dBm and below) | alarm | Poor |
| Approval | approved | clear | Approved |
| | pending | caution | Pending |
| | rejected | alarm | Rejected |
| | suspended | muted | Suspended |
| Incident | suspected | caution | Suspected |
| | confirmed | alarm | Confirmed |
| | acknowledged | rescue | Acknowledged |
| | resolved | clear | Resolved |
| | cancelled | muted | Cancelled |
| | false alarm | muted | False alarm |
| Alert delivery | queued | caution | Queued |
| | sent | clear | Sent |
| | failed | alarm | Failed |
| | acknowledged | rescue | Acknowledged |
| Vehicle | active | clear | Active |
| | maintenance | caution | Maintenance |
| | retired | muted | Retired |

The signal column is RSSI, independent of the heartbeat connection state. An
offline or never-seen tracker shows “No signal” instead of a stale reading. The
RSSI band never uses the connection label “Weak signal”; that label belongs to
the 2–5 minute heartbeat window only.

## Layout and responsive

- Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Sidebar: 248 px from `lg`; bottom navigation below `lg`. Header is sticky.
- Main content: maximum 1280 px, centred, 16 px padding mobile / 24 px desktop.
- A 390 px viewport must be usable: no page-level horizontal scroll, 44 px
  minimum touch targets for primary mobile actions, tables scroll inside their
  panel.
- Use the same table, filters, drawer and empty-state pattern on every page.
- Density is a feature: do not replace a table with a grid of identical cards.

## Motion

- Motion exists only to explain a state change: 120–200 ms, ease-out.
- One slow beacon pulse on the logo; one login load sequence. No bouncing,
  floating, parallax or long fades.
- `prefers-reduced-motion: reduce` disables animation and smooth scrolling.

## Content rules

- Name the user's task: “Register a tracker”, “Acknowledge incident”.
- Errors say what happened and what to do next. No “Oops”, no exclamation marks,
  no apologies.
- No marketing words: seamless, unlock, elevate, streamline, empower,
  supercharge, revolutionize, effortless.
- Relative times (“3 min ago”) show the absolute timestamp on hover.
- MAC addresses are uppercase, colon-grouped and copyable.
- Empty states invite the next action; they do not blame the user.
- EN is the reference locale; all user-facing copy lives in the message files.

## Accessibility

- Target: zero serious or critical axe violations.
- Text contrast is at least 4.5:1; non-text UI boundaries at least 3:1.
- Focus is always visible: 2 px `signal-400` outline, 2 px offset.
- Keyboard: logical tab order, Enter submits, Esc closes overlays, focus is
  trapped in drawers/modals and returns to the trigger on close.
- Every input has a visible label. Errors are announced with `role="alert"` and
  linked with `aria-describedby`.
- Status is text plus colour, never colour alone.
- The current focus ring, labels and reduced-motion rules live in
  `globals.css`; do not override them per page.

## Current implementation and debt

Implemented today: colour tokens, Barlow/Barlow Condensed, button, input,
select, textarea, label, badge, card, table, stat card, page header, empty
state, status badges, Sonner toast, logo.

Added in Cycle 0: JetBrains Mono, `fog-400`, a six-step type scale, radius and
shadow tokens, opaque sticky surfaces, and tokenised chart/logo/toast colours.

Missing and required by this contract: drawer, modal, skeleton, tooltip, focus
trap, copy-to-clipboard control and pagination.

Known debt to fix as each page is touched:

- Trackers still uses an orange label link, stacked status chips, plain battery
  and firmware columns, and a full-width registration form.
- Login still uses a larger hero than the scale allows; it is reduced to
  `text-display` in Cycle 0.
- Several pages still use arbitrary `text-[Npx]` values.
- `global-error.tsx` and `manifest.ts` keep literal colours because they must
  render without the stylesheet or because the format requires literals.

## How to change the system

1. Change a token in `globals.css`, not a component.
2. If a new token is necessary, document it in this file and add the contrast
   measurement.
3. Run `bash scripts/design-lint.sh` and the web verification path.
4. A component that needs a new visual state belongs in this table first.
