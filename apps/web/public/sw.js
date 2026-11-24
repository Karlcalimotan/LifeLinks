/*
 * LifeLink service worker: incident push and a public offline shell.
 *
 * Privacy rule: this worker never stores API responses, RSC payloads, HTML
 * documents or authenticated pages. `install` precaches only the offline page,
 * the manifest, the public icons and the brand marks. `fetch` classifies every
 * same-origin GET with the tested policy in `sw-cache-policy.js`; anything that
 * is not a navigation or an allowlisted public asset is left to the network.
 *
 * The push payload is built by `lib/push/payload.ts`: incident id, plate, one
 * short sentence and a relative URL. Nothing else. Both the "Cancel alert"
 * action and a plain tap open the same deep link, which puts the incident
 * page's cancel control in focus. iOS ignores notification actions, so the
 * deep link is the whole path there.
 *
 * `sw-url.js` holds the same-origin URL guard and is tested directly.
 * `sw-cache-policy.js` holds the cache classification and is tested directly.
 * A new worker waits until the page posts SKIP_WAITING; it never takes over
 * under an open tab on its own.
 */
importScripts("/sw-url.js");
importScripts("/sw-cache-policy.js");

const STATIC_CACHE = "lifelink-static-v1";
const STATIC_CACHE_PREFIX = "lifelink-static-";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
	OFFLINE_URL,
	"/manifest.webmanifest",
	"/icons/icon-192.png",
	"/icons/icon-512.png",
	"/icons/icon-maskable-512.png",
	"/icons/apple-touch-icon.png",
	"/logo-mark.svg",
	"/logo.svg",
];

const OFFLINE_FALLBACK = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · LifeLink</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071013;color:#E8F1F2;font:16px/1.5 system-ui,sans-serif;padding:24px}
main{max-width:32rem}
h1{font-size:1.5rem;margin:0 0 8px}
p{margin:0 0 12px;color:#B8C9CB}
</style>
</head>
<body>
<main>
<h1>You are offline · Wala kang koneksyon</h1>
<p>LifeLink needs a connection to show incidents and vehicle data. Reconnect, then try again.</p>
<p lang="tl">Kailangan ng koneksyon ang LifeLink para ipakita ang mga insidente at datos ng sasakyan. Kumonekta muli, pagkatapos subukan ulit.</p>
<a href="/" style="display:inline-block;background:#FF5A1F;color:#071013;border-radius:4px;padding:10px 16px;font-weight:600;text-decoration:none">Retry · Subukan ulit</a>
</main>
</body>
</html>`;

const { safeNotificationUrl } = self.LifeLinkPushUrl;

const ACTION_LABELS = {
	en: "Cancel alert",
	tl: "Ihinto ang alert",
};

function localeFor(url) {
	const match = /^\/([a-z]{2})\//.exec(url);
	return match && ACTION_LABELS[match[1]] ? match[1] : "en";
}

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(STATIC_CACHE_PREFIX) && key !== STATIC_CACHE)
					.map((key) => caches.delete(key)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("message", (event) => {
	if (event.data && event.data.type === "SKIP_WAITING") {
		self.skipWaiting();
	}
});

/** A static response is stored only if it is public and not a document. */
function isCacheable(response) {
	if (!response || !response.ok || response.type !== "basic") return false;
	const type = (response.headers.get("content-type") || "").toLowerCase();
	if (type.indexOf("text/html") !== -1) return false;
	if (type.indexOf("application/json") !== -1) return false;
	if (type.indexOf("text/x-component") !== -1) return false;
	const control = (response.headers.get("cache-control") || "").toLowerCase();
	if (control.indexOf("no-store") !== -1 || control.indexOf("private") !== -1) return false;
	return true;
}

async function cacheFirst(request) {
	const cache = await caches.open(STATIC_CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (isCacheable(response)) {
		try {
			await cache.put(request, response.clone());
		} catch {
			// A full or unavailable cache must not break the page.
		}
	}
	return response;
}

async function networkFirst(request) {
	try {
		// Never let the browser's HTTP cache answer a console navigation.
		return await fetch(request, { cache: "no-store" });
	} catch {
		const cache = await caches.open(STATIC_CACHE);
		const offline = await cache.match(OFFLINE_URL);
		if (offline) return offline;
		return new Response(OFFLINE_FALLBACK, {
			status: 200,
			headers: {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	}
}

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;

	const kind = self.LifeLinkCachePolicy.classifyRequest({
		url: request.url,
		method: request.method,
		mode: request.mode,
		origin: self.location.origin,
		headers: request.headers,
	});

	if (kind === "navigation") {
		event.respondWith(networkFirst(request));
		return;
	}
	if (kind === "static") {
		event.respondWith(cacheFirst(request));
	}
	// "private" and "cross-origin" are network-only: no respondWith, no cache.
});

self.addEventListener("push", (event) => {
	if (!event.data) return;

	let payload;
	try {
		payload = event.data.json();
	} catch {
		return;
	}
	if (!payload || typeof payload !== "object") return;

	const url = safeNotificationUrl(payload.url, self.location.origin);
	const plate = typeof payload.plate === "string" ? payload.plate.slice(0, 40) : "";
	const body = typeof payload.body === "string" ? payload.body : "";
	const incidentId = typeof payload.incidentId === "string" ? payload.incidentId : "";
	const locale = localeFor(url);

	event.waitUntil(
		self.registration.showNotification(plate ? `LifeLink · ${plate}` : "LifeLink", {
			body,
			icon: "/logo-mark.svg",
			badge: "/logo-mark.svg",
			tag: incidentId ? `incident-${incidentId}` : "incident",
			requireInteraction: true,
			data: { url },
			actions: [{ action: "cancel", title: ACTION_LABELS[locale] }],
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = safeNotificationUrl(event.notification.data?.url, self.location.origin);
	event.waitUntil(openIncident(url));
});

async function openIncident(url) {
	const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
	for (const client of windows) {
		let sameOrigin = false;
		try {
			sameOrigin = new URL(client.url).origin === self.location.origin;
		} catch {
			sameOrigin = false;
		}
		if (!sameOrigin) continue;
		await client.focus();
		if (typeof client.navigate === "function") {
			try {
				await client.navigate(url);
			} catch {
				// Some browsers refuse navigation from a notification click; the
				// focused tab is still better than no response.
			}
		}
		return;
	}
	await self.clients.openWindow(url);
}
