import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
const policy = readFileSync(path.join(process.cwd(), "public/sw-cache-policy.js"), "utf8");

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
		for (const field of ["incidentId", "plate", "body", "url"]) {
			expect(source).toContain(`payload.${field}`);
		}
		for (const forbidden of [
			"payload.token",
			"payload.p256dh",
			"payload.auth",
			"payload.latitude",
			"payload.longitude",
			"payload.phone",
		]) {
			expect(source).not.toContain(forbidden);
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
		expect(source).toContain("text/html");
		expect(source).toContain("application/json");
		expect(source).toContain("text/x-component");
		expect(source).toContain("no-store");
		expect(policy).toContain("/api/");
		expect(policy).toContain("_rsc");
		expect(source).not.toContain("indexedDB");
	});

	it("waits for the update message before activating", () => {
		const install = source.slice(
			source.indexOf('addEventListener("install"'),
			source.indexOf('addEventListener("activate"'),
		);
		expect(install).not.toContain("skipWaiting");
		expect(source).toContain('event.data.type === "SKIP_WAITING"');
		expect(source).toContain("self.skipWaiting()");
	});

	it("delegates URL safety to the tested guard", () => {
		expect(source).toContain('importScripts("/sw-url.js")');
		expect(source).toContain("safeNotificationUrl");
	});
});
