import { readFileSync } from "node:fs";
import path from "node:path";
import { createContext, runInContext } from "node:vm";
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

describe("worker evaluation", () => {
	it("evaluates in a classic worker scope with the real imports", () => {
		const root = path.join(process.cwd(), "public");
		const workerSelf: Record<string, unknown> = {
			location: { origin: "http://localhost:3000" },
			addEventListener: () => {},
			registration: {},
			clients: {
				claim: async () => {},
				matchAll: async () => [],
				openWindow: async () => {},
			},
			skipWaiting: () => {},
		};
		const sandbox: Record<string, unknown> = {
			self: workerSelf,
			URL,
			console,
			Response: class {
				ok = true;
				type = "basic";
				headers = new Headers();
			},
			caches: {
				open: async () => ({
					add: async () => {},
					match: async () => undefined,
					put: async () => {},
				}),
				keys: async () => [],
				delete: async () => true,
			},
			fetch: async () => {
				throw new Error("no network in the worker evaluation test");
			},
		};
		const context = createContext(sandbox);
		sandbox.importScripts = (...names: string[]) => {
			for (const name of names) {
				const file = path.join(root, name.replace(/^\//, ""));
				runInContext(readFileSync(file, "utf8"), context, { filename: file });
			}
		};

		expect(() => runInContext(source, context, { filename: "sw.js" })).not.toThrow();

		const pushUrl = workerSelf.LifeLinkPushUrl as
			| { safeNotificationUrl: (value: unknown, origin: string) => string }
			| undefined;
		expect(typeof pushUrl?.safeNotificationUrl).toBe("function");
		expect(pushUrl?.safeNotificationUrl("/en/incidents/1", "http://localhost:3000")).toBe(
			"/en/incidents/1",
		);
		expect(pushUrl?.safeNotificationUrl("//evil.com", "http://localhost:3000")).toBe("/");

		const policy = workerSelf.LifeLinkCachePolicy as
			| { classifyRequest: (request: unknown) => string }
			| undefined;
		expect(
			policy?.classifyRequest({
				url: "http://localhost:3000/en/dashboard",
				method: "GET",
				mode: "navigate",
				origin: "http://localhost:3000",
				headers: new Headers(),
			}),
		).toBe("navigation");
	});
});
