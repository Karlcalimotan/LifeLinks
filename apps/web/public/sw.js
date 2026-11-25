/*
 * LifeLink service worker: incident push and a public offline shell.
 *
 * Privacy rule: this worker never stores API responses, RSC payloads, HTML
 * documents or authenticated pages. `install` precaches only the offline page,
 * the manifest, the public icons and the brand marks. The offline page is the
 * only mandatory entry; a missing optional file logs a warning instead of
 * blocking activation. `fetch` classifies every same-origin GET with the tested
 * policy in `sw-cache-policy.js`; anything that is not a navigation or an
 * allowlisted public asset is left to the network.
 *
 * The push payload is built by `lib/push/payload.ts`: incident id, plate, one
 * short sentence and a relative URL. Nothing else. Both the "Cancel alert"
 * action and a plain tap open the same deep link, which puts the incident
 * page's cancel control in focus. iOS ignores notification actions, so the
 * deep link is the whole path there.
 *
 * `sw-url.js` holds the same-origin URL guard and is tested directly.
 * `sw-cache-policy.js` holds the cache classification and is tested directly.
 * A new worker waits until a same-origin page posts SKIP_WAITING; it never
 * takes over under an open tab on its own.
 */
importScripts("/sw-url.js");
importScripts("/sw-cache-policy.js");

const STATIC_CACHE = "lifelink-static-v1";
const STATIC_CACHE_PREFIX = "lifelink-static-";
const { OFFLINE_URL, PRECACHE_URLS, isCacheable } = self.LifeLinkCachePolicy;

const { safeNotificationUrl: resolveNotificationUrl } = self.LifeLinkPushUrl;

const ACTION_LABELS = {
	en: "Cancel alert",
	tl: "Ihinto ang alert",
};

function localeFor(url) {
	const match = /^\/([a-z]{2})\//.exec(url);
	return match && ACTION_LABELS[match[1]] ? match[1] : "en";
}

/**
 * Precache every public URL, but fail the install only when the offline page
 * itself cannot be stored. A missing optional icon must not leave the console
 * with an old worker that never activates.
 */
async function precache() {
	const cache = await caches.open(STATIC_CACHE);
	const results = await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));

	for (const [index, result] of results.entries()) {
		if (result.status !== "rejected") continue;
		const url = PRECACHE_URLS[index];
		if (url === OFFLINE_URL) {
			console.error(
				"LifeLink: the offline page could not be precached; install aborted.",
				result.reason,
			);
			throw result.reason;
		}
		console.warn(`LifeLink: optional precache failed: ${url}`, result.reason);
	}
}

self.addEventListener("install", (event) => {
	event.waitUntil(precache());
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

function isSameOriginClient(source) {
	if (!source || typeof source.url !== "string") return false;
	try {
		return new URL(source.url).origin === self.location.origin;
	} catch {
		return false;
	}
}

self.addEventListener("message", (event) => {
	if (!event.data || event.data.type !== "SKIP_WAITING") return;
	if (!isSameOriginClient(event.source)) {
		console.warn("LifeLink: ignored SKIP_WAITING from a non-same-origin client.");
		return;
	}
	self.skipWaiting();
});

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
		// The offline page is precached and is the only mandatory entry, so this
		// is a last-resort plain response, not a second copy of the page.
		return new Response(
			"LifeLink is offline. Reconnect and try again.\nWala kang koneksyon. Kumonekta muli at subukan ulit.",
			{
				status: 503,
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"cache-control": "no-store",
				},
			},
		);
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

	const url = resolveNotificationUrl(payload.url, self.location.origin);
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
	const url = resolveNotificationUrl(event.notification.data?.url, self.location.origin);
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
