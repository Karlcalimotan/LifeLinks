import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const securityHeaders = [
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	serverExternalPackages: ["@prisma/client", "web-push"],
	experimental: {
		serverActions: {
			bodySizeLimit: "2mb",
		},
	},
	turbopack: {
		root: path.resolve(import.meta.dirname ?? process.cwd(), "../.."),
	},
	async headers() {
		const workerHeaders = [
			{ key: "Cache-Control", value: "no-cache" },
			{ key: "Service-Worker-Allowed", value: "/" },
		];
		return [
			{ source: "/(.*)", headers: securityHeaders },
			{
				// Registered at the root so one worker covers every locale path.
				// Browsers revalidate the script themselves; no-cache keeps proxies
				// from pinning an old worker after a deploy.
				source: "/sw.js",
				headers: workerHeaders,
			},
			{
				// Imported by the worker; the same staleness rules apply.
				source: "/sw-url.js",
				headers: workerHeaders,
			},
		];
	},
};

export default withNextIntl(nextConfig);
