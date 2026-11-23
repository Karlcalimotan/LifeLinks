/*
 * LifeLink service worker: incident push only.
 *
 * There is deliberately no fetch handler and no Cache API use. The console
 * serves private incident data; a service worker that cached API responses
 * would leak them across sessions and accounts. The browser's HTTP cache
 * already follows the `cache-control: no-store` headers the API sends.
 *
 * The payload is built by `lib/push/payload.ts`: incident id, plate, one short
 * sentence and a relative URL. Nothing else. Both the "Cancel alert" action and
 * a plain tap open the same deep link, which puts the incident page's cancel
 * control in focus. iOS ignores notification actions, so the deep link is the
 * whole path there.
 *
 * `sw-url.js` holds the same-origin URL guard and is tested directly.
 */
importScripts("/sw-url.js");

const ACTION_LABELS = {
	en: "Cancel alert",
	tl: "Ihinto ang alert",
};

const { safeNotificationUrl } = self.LifeLinkPushUrl;

function localeFor(url) {
	const match = /^\/([a-z]{2})\//.exec(url);
	return match && ACTION_LABELS[match[1]] ? match[1] : "en";
}

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
