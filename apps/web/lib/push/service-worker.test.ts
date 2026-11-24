import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
const policy = readFileSync(path.join(process.cwd(), "public/sw-cache-policy.js"), "utf8");

function pushHandlerSource(): string {
	const start = source.indexOf('self.addEventListener("push"');
	const end = source.indexOf('self.addEventListener("notificationclick"');
	return source.slice(start, end);
}

describe("service worker", () => {
	it("handles push and notification clicks", () => {
		expect(source).toContain('addEventListener("push"');
		expect(source).toContain('addEventListener("notificationclick"');
		expect(source).toContain("showNotification");
	});

	it("offers the Android cancel action and opens the incident deep link", () => {
		expect(source).toContain('action: "cancel"');
		expect(source).toContain('"Cancel alert"');
		expect(source).toContain("openWindow");
		expect(source).toContain("navigate");
	});

	it("reads only the agreed payload fields", () => {
		const pushHandler = pushHandlerSource();
		expect(pushHandler.length).toBeGreaterThan(0);

		for (const field of ["incidentId", "plate", "body", "url"]) {
			expect(pushHandler).toContain(`payload.${field}`);
		}

		// Scan the whole push handler, not just dotted accesses, so a
		// whole-payload leak is caught as well.
		const lower = pushHandler.toLowerCase();
		for (const forbidden of ["token", "p256dh", "auth", "latitude", "longitude", "phone"]) {
			expect(lower).not.toContain(forbidden);
		}
	});

	it("adds the offline shell handlers", () => {
		expect(source).toContain('addEventListener("install"');
		expect(source).toContain('addEventListener("activate"');
		expect(source).toContain('addEventListener("fetch"');
		expect(source).toContain('addEventListener("message"');
		expect(source).toContain('importScripts("/sw-cache-policy.js")');
		expect(source).toContain("LifeLinkCachePolicy");
		expect(source).toContain("OFFLINE_URL");
		expect(source).toContain("clients.claim");
	});

	it("caches only the static class and keeps navigations out of the cache", () => {
		expect(source).toMatch(/kind === "static"[\s\S]{0,60}respondWith\(cacheFirst/);
		expect(source).toMatch(/kind === "navigation"[\s\S]{0,60}respondWith\(networkFirst/);

		const cacheFirst = source.slice(
			source.indexOf("async function cacheFirst"),
			source.indexOf("async function networkFirst"),
		);
		const networkFirst = source.slice(
			source.indexOf("async function networkFirst"),
			source.indexOf('addEventListener("fetch"'),
		);
		expect(cacheFirst).toContain("cache.put");
		expect(networkFirst).not.toContain("cache.put");
	});

	it("refuses to store documents and private responses", () => {
		expect(policy).toContain("function isCacheable");
		expect(policy).toContain("text/html");
		expect(policy).toContain("application/json");
		expect(policy).toContain("text/x-component");
		expect(policy).toContain("no-store");
		expect(policy).toContain("private");
		expect(policy).toContain("/api/");
		expect(policy).toContain("_rsc");
		expect(source).toContain("isCacheable");
		expect(source).not.toContain("indexedDB");
	});

	it("precaches each URL and makes only the offline page mandatory", () => {
		expect(source).toContain("Promise.allSettled");
		expect(source).toContain("cache.add(");
		expect(source).not.toContain("cache.addAll");
		expect(source).toContain("url === OFFLINE_URL");
		expect(source).toContain("console.error");
	});

	it("uses the cached offline page instead of a second copy", () => {
		expect(source).toContain("cache.match(OFFLINE_URL)");
		expect(source).not.toContain("<!doctype");
		expect(source).not.toContain("<html");
		expect(source).not.toContain("OFFLINE_FALLBACK");
	});

	it("waits for a same-origin update message before activating", () => {
		const install = source.slice(
			source.indexOf('addEventListener("install"'),
			source.indexOf('addEventListener("activate"'),
		);
		expect(install).not.toContain("skipWaiting");
		expect(source).toContain('event.data.type !== "SKIP_WAITING"');
		expect(source).toContain("self.skipWaiting()");
		expect(source).toContain("event.source");
		expect(source).toContain("isSameOriginClient");
	});

	it("delegates URL safety to the tested guard", () => {
		expect(source).toContain('importScripts("/sw-url.js")');
		expect(source).toContain("safeNotificationUrl");
	});
});
