# Installable console and offline shell

Status: implemented on `feat/pwa-install` for issue #133.

LifeLink can be installed to a phone home screen. It keeps a small, public
offline shell. It never stores incident, vehicle, member or API data.

## What is installed

- `apps/web/app/manifest.ts` serves `/manifest.webmanifest` with `id`, `scope`
  and `start_url` all at `/`. The middleware redirects `/` to the visitor's
  locale, so an installed icon does not freeze English or Tagalog.
- The display mode is `standalone` with `minimal-ui` as the fallback, portrait
  orientation, and the `ink-950` canvas and theme colour.
- Icons are PNG files in `apps/web/public/icons/`: 192, 512, a maskable 512
  with the mark inside the safe circle, and the 180 Apple touch icon.
- The metadata in `apps/web/app/[locale]/layout.tsx` sets
  `applicationName`, the web manifest, the PNG favicon/apple icon and the
  Apple web app title.

## Install steps

1. Open the console over HTTPS. Service workers and installation are refused
   on plain HTTP except `localhost`.
2. **Chrome, Edge, Samsung Internet on Android:** the dashboard shows an
   install banner and Settings shows an install card. Tap Install, or use the
   browser menu and choose "Install app".
3. **Safari on iPhone or iPad:** Safari does not fire an install prompt. Tap
   Share, then Add to Home Screen. The same instruction is shown in Settings
   and in the dashboard banner on iOS.
4. **Desktop:** use the install icon in the browser address bar, or the
   browser menu. The Settings card says so when no prompt is available.

The banner is dismissible and stays dismissed for 30 days
(`lifelink.pwa.install.dismissed` in `localStorage`). Both surfaces disappear
when `display-mode: standalone` is active.

## Offline policy

`apps/web/public/sw.js` handles four request classes. The classification lives
in `apps/web/public/sw-cache-policy.js`, a dependency-free classic script loaded
with `importScripts` and tested directly by
`apps/web/lib/pwa/cache-policy.test.ts`.

| Request | Behaviour | Cached |
| --- | --- | --- |
| Same-origin navigation (`mode: navigate`) | Network-first. On failure, serve `/offline.html`. | No |
| `/_next/static/`, `/icons/`, `/fonts/`, `/manifest.webmanifest`, `/offline.html`, `/logo*.svg`, `/favicon*` | Cache-first in the versioned `lifelink-static-v1` cache. | Yes, public assets only |
| `/api/...`, any URL with `_rsc`, RSC headers, `text/x-component`, HTML/JSON responses, authenticated pages, everything else | Network-only. The worker does not call `respondWith`, so the browser handles it. | Never |
| Cross-origin requests | Network-only. | Never |

Additional guards:

- `GET` only. Any other method is network-only.
- A response is stored only when it is `ok`, same-origin (`type: "basic"`), and
  not HTML, JSON, RSC or marked `no-store`/`private`.
- Navigations are fetched with `cache: "no-store"` so the browser HTTP cache
  cannot answer a console page.
- The offline page has no external assets, no API call and no private data. It
  is English and Tagalog with a Retry button.

## Update flow

The worker does not call `skipWaiting()` on install. A new worker installs,
precaches the public shell and waits.

1. `components/pwa/service-worker-runtime.tsx` registers `/sw.js` from the root
   locale layout, so the login page is covered too. It watches `updatefound`,
   `installing.statechange` and `registration.waiting`.
2. When a controller exists and a new worker is waiting, a small banner appears
   with Reload and Later.
3. Reload posts `{ type: "SKIP_WAITING" }`. The worker calls `skipWaiting()` only
   on that message; the page reloads once on `controllerchange` (with a single
   timeout fallback).
4. On activation the worker deletes older `lifelink-static-*` caches and calls
   `clients.claim()`.

If the offline page or the precache list changes, bump `STATIC_CACHE` in
`sw.js`.

## Privacy rule

**Private console data is never cached.** The worker does not store API
responses, RSC payloads, HTML documents, authenticated pages or cross-origin
resources. The only cached responses are public build assets under
`/_next/static/` and `/fonts/`, plus the offline page, the manifest, the public
icons and the brand marks.

The existing push behaviour is unchanged: same `/sw.js`, same push and
`notificationclick` handlers, same same-origin URL guard in `sw-url.js`, and
the same notification payload fields. Registering the worker globally and again
from the push control returns the same registration.

## Regenerating icons

```bash
node scripts/generate-pwa-icons.mjs
```

The script uses the Playwright Chromium already installed for tests, renders
`apps/web/public/logo-mark.svg` on `#071013`, writes the four PNGs to
`apps/web/public/icons/`, and verifies each PNG header before it exits. It is
deterministic and is not part of the build.

## Verification

- `lib/pwa/install.test.ts`: standalone mode, iOS detection, prompt capability,
  surface precedence and dismissal expiry.
- `lib/pwa/cache-policy.test.ts`: navigation, static, API/RSC and cross-origin
  classification.
- `app/manifest.test.ts`: identity, scope, icon sizes and purposes.
- `lib/push/service-worker.test.ts`: push handlers unchanged and the cache
  policy still refuses private responses.
