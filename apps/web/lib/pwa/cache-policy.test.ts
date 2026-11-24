import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Classification = "navigation" | "static" | "private" | "cross-origin";

interface FakeResponse {
	ok: boolean;
	type: string;
	headers: { get(name: string): string | null };
}

interface PolicyGlobal {
	LifeLinkCachePolicy?: {
		OFFLINE_URL: string;
		PRECACHE_URLS: string[];
		classifyRequest: (request: {
			url: string;
			method?: string;
			mode?: string;
			origin?: string;
			headers?: { get(name: string): string | null };
		}) => Classification;
		isCacheable: (response: FakeResponse | null | undefined) => boolean;
		isStaticAsset: (pathname: string) => boolean;
	};
}

const source = readFileSync(path.join(process.cwd(), "public/sw-cache-policy.js"), "utf8");
const sandbox: { self: PolicyGlobal } = { self: {} };
runInNewContext(source, { self: sandbox.self, URL });

const policy = sandbox.self.LifeLinkCachePolicy;
if (!policy) throw new Error("sw-cache-policy.js did not expose LifeLinkCachePolicy");

const ORIGIN = "https://console.lifelink.test";

function headers(values: Record<string, string> = {}) {
	return {
		get(name: string): string | null {
			const match = Object.entries(values).find(
				([key]) => key.toLowerCase() === name.toLowerCase(),
			);
			return match ? match[1] : null;
		},
	};
}

function request(
	pathname: string,
	overrides: Partial<{
		method: string;
		mode: string;
		origin: string;
		headers: { get(name: string): string | null };
	}> = {},
) {
	return {
		url: new URL(pathname, ORIGIN).href,
		method: "GET",
		mode: "cors",
		origin: ORIGIN,
		headers: headers(),
		...overrides,
	};
}

function fakeResponse({
	ok = true,
	type = "basic",
	contentType = "application/javascript",
	cacheControl = "",
}: {
	ok?: boolean;
	type?: string;
	contentType?: string;
	cacheControl?: string;
} = {}): FakeResponse {
	const values: Record<string, string> = { "content-type": contentType };
	if (cacheControl) values["cache-control"] = cacheControl;
	return { ok, type, headers: headers(values) };
}

describe("service worker cache policy", () => {
	it("treats same-origin navigations as network-first", () => {
		expect(policy.classifyRequest(request("/en/dashboard", { mode: "navigate" }))).toBe(
			"navigation",
		);
		expect(policy.classifyRequest(request("/tl/incidents/inc-1", { mode: "navigate" }))).toBe(
			"navigation",
		);
	});

	it("allows only public static assets to be cached", () => {
		expect(policy.classifyRequest(request("/_next/static/chunks/app-a1b2.js"))).toBe("static");
		expect(policy.classifyRequest(request("/icons/icon-192.png"))).toBe("static");
		expect(policy.classifyRequest(request("/manifest.webmanifest"))).toBe("static");
		expect(policy.classifyRequest(request("/offline.html"))).toBe("static");
		expect(policy.classifyRequest(request("/logo-mark.svg"))).toBe("static");
		expect(policy.isStaticAsset("/_next/static/media/barlow.woff2")).toBe(true);
		expect(policy.isStaticAsset("/fonts/barlow.woff2")).toBe(false);
		expect(policy.isStaticAsset("/favicon.ico")).toBe(false);
	});

	it("stores only public, basic, non-document responses", () => {
		expect(policy.isCacheable(fakeResponse())).toBe(true);
		expect(policy.isCacheable(fakeResponse({ contentType: "image/png" }))).toBe(true);
		expect(policy.isCacheable(fakeResponse({ contentType: "" }))).toBe(false);
		expect(policy.isCacheable(fakeResponse({ contentType: "text/html; charset=utf-8" }))).toBe(
			false,
		);
		expect(policy.isCacheable(fakeResponse({ contentType: "application/json" }))).toBe(false);
		expect(policy.isCacheable(fakeResponse({ contentType: "text/x-component" }))).toBe(false);
		expect(policy.isCacheable(fakeResponse({ cacheControl: "public, no-store" }))).toBe(false);
		expect(policy.isCacheable(fakeResponse({ cacheControl: "private, max-age=60" }))).toBe(false);
		expect(policy.isCacheable(fakeResponse({ ok: false }))).toBe(false);
		expect(policy.isCacheable(fakeResponse({ type: "cors" }))).toBe(false);
		expect(policy.isCacheable(fakeResponse({ type: "opaque" }))).toBe(false);
		expect(policy.isCacheable(null)).toBe(false);
	});

	it("maps every precache URL to a public file or the manifest route", () => {
		const publicDir = path.join(process.cwd(), "public");
		const generatedRoutes = new Set(["/manifest.webmanifest"]);

		expect(policy.PRECACHE_URLS).toContain(policy.OFFLINE_URL);
		expect(policy.PRECACHE_URLS).toContain("/manifest.webmanifest");

		for (const url of policy.PRECACHE_URLS) {
			if (generatedRoutes.has(url)) continue;
			expect(existsSync(path.join(publicDir, url.replace(/^\//, ""))), `${url} should exist`).toBe(
				true,
			);
		}
	});

	it("never caches API responses or Next.js RSC payloads", () => {
		expect(policy.classifyRequest(request("/api/incidents"))).toBe("private");
		expect(policy.classifyRequest(request("/api/search?q=abc"))).toBe("private");
		expect(policy.classifyRequest(request("/en/dashboard?_rsc=1x2y3"))).toBe("private");
		expect(
			policy.classifyRequest(request("/en/dashboard", { headers: headers({ RSC: "1" }) })),
		).toBe("private");
		expect(
			policy.classifyRequest(
				request("/en/dashboard", { headers: headers({ accept: "text/x-component" }) }),
			),
		).toBe("private");
		expect(
			policy.classifyRequest(
				request("/en/dashboard", { headers: headers({ purpose: "prefetch" }) }),
			),
		).toBe("private");
	});

	it("never caches HTML or authenticated page data fetched as a document", () => {
		expect(policy.classifyRequest(request("/en/settings"))).toBe("private");
		expect(policy.classifyRequest(request("/en/incidents/inc-1"))).toBe("private");
		expect(policy.classifyRequest(request("/login"))).toBe("private");
	});

	it("leaves cross-origin requests to the browser", () => {
		expect(
			policy.classifyRequest({
				...request("/anything"),
				url: "https://cdn.example.com/app.js",
			}),
		).toBe("cross-origin");
		expect(
			policy.classifyRequest({
				...request("/anything"),
				url: "https://evil.example.com/en/dashboard",
				mode: "navigate",
			}),
		).toBe("cross-origin");
	});

	it("treats non-GET requests as network-only", () => {
		expect(policy.classifyRequest(request("/api/device/command", { method: "POST" }))).toBe(
			"private",
		);
		expect(policy.classifyRequest(request("/en/dashboard", { method: "DELETE" }))).toBe("private");
	});

	it("treats malformed request objects as network-only", () => {
		expect(policy.classifyRequest({ url: "not a url", origin: ORIGIN })).toBe("private");
		expect(policy.classifyRequest(undefined as never)).toBe("private");
	});
});
