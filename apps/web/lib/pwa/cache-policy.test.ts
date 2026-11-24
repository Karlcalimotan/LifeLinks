import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Classification = "navigation" | "static" | "private" | "cross-origin";

interface PolicyGlobal {
	LifeLinkCachePolicy?: {
		OFFLINE_URL: string;
		classifyRequest: (request: {
			url: string;
			method?: string;
			mode?: string;
			origin?: string;
			headers?: { get(name: string): string | null };
		}) => Classification;
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
		expect(policy.isStaticAsset("/fonts/barlow.woff2")).toBe(true);
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
