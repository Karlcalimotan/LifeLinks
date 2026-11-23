/*
 * Same-origin URL guard for the push service worker.
 *
 * Loaded with `importScripts` so the deployed logic itself can be exercised by
 * a test. A notification payload is built by the server and encrypted to this
 * browser, but a click handler still refuses to navigate anywhere except this
 * origin: protocol-relative (`//evil.com`), backslash-smuggled (`/\evil.com`)
 * and absolute foreign URLs all fall back to "/".
 *
 * Keep this file dependency free and classic-script compatible.
 */
function safeNotificationUrl(value, origin) {
	if (typeof value !== "string") return "/";
	if (!value.startsWith("/") || value.startsWith("//")) return "/";
	try {
		const parsed = new URL(value, origin);
		if (parsed.origin !== origin) return "/";
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return "/";
	}
}

self.LifeLinkPushUrl = { safeNotificationUrl };
