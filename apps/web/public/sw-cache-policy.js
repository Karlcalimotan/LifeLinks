/*
 * Offline cache policy for the LifeLink service worker.
 *
 * Classic-script compatible: loaded with `importScripts` by `sw.js` and
 * exercised directly by `lib/pwa/cache-policy.test.ts`. Keep this file free of
 * dependencies and syntax that a service worker cannot parse.
 *
 * The console renders private incident, vehicle and member data. Only public,
 * immutable build output may ever be stored. API responses, RSC payloads,
 * HTML documents, authenticated pages and every cross-origin request are
 * network-only.
 */
(() => {
	const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/fonts/"];
	const STATIC_FILES = [
		"/manifest.webmanifest",
		"/offline.html",
		"/favicon.svg",
		"/favicon.ico",
		"/logo.svg",
		"/logo-mark.svg",
	];

	function parseUrl(value, origin) {
		try {
			return new URL(value, origin);
		} catch {
			return null;
		}
	}

	function isPrivatePath(url) {
		if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return true;
		// Next.js App Router payloads carry `_rsc`; they contain rendered page
		// data and must never enter a cache.
		if (url.searchParams.has("_rsc")) return true;
		return false;
	}

	function hasPrivateHeaders(headers) {
		if (!headers || typeof headers.get !== "function") return false;
		if (headers.get("RSC")) return true;
		const accept = headers.get("accept") || "";
		const purpose = headers.get("purpose") || headers.get("sec-purpose") || "";
		if (accept.indexOf("text/x-component") !== -1) return true;
		if (purpose.indexOf("prefetch") !== -1) return true;
		return false;
	}

	function isStaticAsset(pathname) {
		for (const prefix of STATIC_PREFIXES) {
			if (pathname.startsWith(prefix)) return true;
		}
		return STATIC_FILES.indexOf(pathname) !== -1;
	}

	/**
	 * Classify a request for the fetch handler.
	 *
	 * Returns one of:
	 * - `"navigation"`: network-first, offline page on failure.
	 * - `"static"`: cache-first, only public build output.
	 * - `"private"`: network-only. API, RSC, HTML, authenticated pages and any
	 *   request that is not clearly a public asset.
	 * - `"cross-origin"`: network-only, handled by the browser.
	 */
	function classifyRequest(request) {
		if (!request || typeof request !== "object") return "private";
		const method = typeof request.method === "string" ? request.method.toUpperCase() : "GET";
		if (method !== "GET") return "private";

		const origin = typeof request.origin === "string" ? request.origin : "";
		const url = parseUrl(request.url, origin);
		if (!url) return "private";
		if (!origin || url.origin !== origin) return "cross-origin";

		if (isPrivatePath(url)) return "private";
		if (hasPrivateHeaders(request.headers)) return "private";
		if (request.mode === "navigate") return "navigation";
		if (isStaticAsset(url.pathname)) return "static";
		return "private";
	}

	self.LifeLinkCachePolicy = {
		OFFLINE_URL: "/offline.html",
		classifyRequest,
		isStaticAsset,
	};
})();
