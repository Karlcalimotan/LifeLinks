# Installable console and offline shell

Status: implemented on `feat/pwa-install` for issue #133.

LifeLink can be installed to a phone home screen. It keeps a small, public
offline shell. It never stores incident, vehicle, member or API data.

## What is installed

- `apps/web/app/manifest.ts` serves `/manifest.webmanifest` with `id`, `scope`
  and `start_url` all at `/`. The middleware redirects `/` to the visitor's
  locale, so an installed icon does not freeze English or Tagalog.
- The display mode is `standalone` with `minimal-ui` as the fallback. The
  orientation is `any`, so tablets can keep the map and tables in landscape.
  The canvas and theme colour are `ink-950`.
- Icons are PNG files in `apps/web/public/icons/`: 192, 512, a maskable 512
  with the mark inside the safe circle, and the 180 Apple touch icon. They are
  served with `Cache-Control: no-cache` so a replacement is revalidated. The
  service worker also precaches them, so replacing an icon still means bumping
  `STATIC_CACHE`.
- The metadata in `apps/web/app/[locale]/layout.tsx` sets
  `applicationName`, the web manifest, the PNG favicon/apple icon and the
  Apple web app title. The Apple status bar style is `black` (opaque), so the
  header and the update banner stay below the status bar and need no safe-area
  padding.

## Install steps

1. Open the console over HTTPS. Service workers and installation are refused
   on plain HTTP except `localhost`.
2. **Chrome, Edge, Samsung Internet on Android:** the dashboard shows an
   install banner and Settings shows an install card. Tap Install, or use the
   browser menu and choose "Install app".
3. **Safari on iPhone or iPad:** Safari does not fire an install prompt. Tap
   Share, then Add to Home Screen. The same instruction is shown in Settings
   and in the dashboard banner on iOS.
4. **Chrome, Firefox, Edge and in-app browsers on iPhone or iPad:** these can
   show the site but cannot add it to the Home Screen. The banner and card say
   "Open this site in Safari", then Share and Add to Home Screen.
5. **Desktop:** use the install icon in the browser address bar, or the
   browser menu. The Settings card says so when no prompt is available.

The banner is dismissible and stays dismissed for 30 days
(`lifelink.pwa.install.dismissed` in `localStorage`). Both surfaces disappear
when `display-mode: standalone` is active.

## Offline policy

`apps/web/public/sw.js` handles four request classes. The classification and
the response guard live in `apps/web/public/sw-cache-policy.js`, a
dependency-free classic script loaded with `importScripts` and tested directly
by `apps/web/lib/pwa/cache-policy.test.ts`.

| Request | Behaviour | Cached |
| --- | --- | --- |
| Same-origin navigation (`mode: navigate`) | Network-first. On failure, serve `/offline.html`. | No |
| `/_next/static/`, `/icons/`, `/manifest.webmanifest`, `/offline.html`, `/favicon.svg`, `/logo.svg`, `/logo-mark.svg` | Cache-first in the versioned `lifelink-static-v1` cache. | Yes, public assets only |
| `/api/...`, any URL with `_rsc`, RSC headers, `text/x-component`, HTML/JSON responses, authenticated pages, everything else | Network-only. The worker does not call `respondWith`, so the browser handles it. | Never |
| Cross-origin requests | Network-only. | Never |

Additional guards:

- `GET` only. Any other method is network-only.
- `isCacheable` is the second privacy layer. Even an allowlisted URL is stored
  only when the response is `ok`, same-origin (`type: "basic"`), and not HTML,
  JSON, RSC or marked `no-store`/`private`.
- Navigations are fetched with `cache: "no-store"` so the browser HTTP cache
  cannot answer a console page.
- Precache runs per URL with `Promise.allSettled`. Only `/offline.html` is
  mandatory; a missing optional icon or manifest logs a warning and does not
  block activation.
- The offline page has no external assets, no API call and no private data. It
  is English and Tagalog with a Retry control.

## Update flow

The worker does not call `skipWaiting()` on install. A new worker installs,
precaches the public shell and waits.

1. `components/pwa/service-worker-runtime.tsx` registers `/sw.js` from the root
   locale layout, so the login page is covered too. It watches `updatefound`,
   `installing.statechange` and `registration.waiting`.
2. When a controller exists and a new worker is waiting, a small banner appears
   with Reload and Later.
3. Reload posts `{ type: "SKIP_WAITING" }`. The worker accepts it only from a
   same-origin client (`event.source`), then calls `skipWaiting()`. The page
   reloads once on `controllerchange` (with a single timeout fallback).
4. On activation the worker deletes older `lifelink-static-*` caches and calls
   `clients.claim()`.

If the offline page, the precache list or an icon changes, bump `STATIC_CACHE`
in `sw.js`.

## Privacy rule

**Private console data is never cached.** The worker does not store API
responses, RSC payloads, HTML documents, authenticated pages or cross-origin
resources. The only cached responses are public build assets under
`/_next/static/`, plus the offline page, the manifest, the public icons and the
brand marks.

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

- `lib/pwa/install.test.ts`: standalone mode, iOS detection, Safari detection,
  prompt capability, surface precedence and dismissal expiry.
- `lib/pwa/cache-policy.test.ts`: navigation, static, API/RSC and cross-origin
  classification, the `isCacheable` response guard and the precache file map.
- `app/manifest.test.ts`: identity, scope, orientation, icon sizes and purposes.
- `lib/push/service-worker.test.ts`: push handlers unchanged, per-URL precache
  and the cache policy still refusing private responses.
