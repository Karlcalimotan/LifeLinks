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
	serverExternalPackages: ["@prisma/client"],
	experimental: {
		serverActions: {
			bodySizeLimit: "2mb",
		},
	},
	turbopack: {
		root: path.resolve(import.meta.dirname ?? process.cwd(), "../.."),
	},
	async headers() {
		return [{ source: "/(.*)", headers: securityHeaders }];
	},
};

export default withNextIntl(nextConfig);
