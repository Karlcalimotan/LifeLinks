import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import type { MetadataRoute } from "next";

/**
 * Installable app manifest.
 *
 * `start_url` is the locale-neutral root: next-intl redirects it to the
 * visitor's locale, so no `/en/...` path is baked into an installed icon. The
 * service worker scope stays at `/` and the worker never caches console pages.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		id: "/",
		name: APP_NAME,
		short_name: APP_NAME,
		description: APP_TAGLINE,
		start_url: "/",
		scope: "/",
		display: "standalone",
		display_override: ["standalone", "minimal-ui"],
		orientation: "any",
		background_color: "#071013",
		theme_color: "#071013",
		icons: [
			{
				src: "/icons/icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
			{
				src: "/icons/apple-touch-icon.png",
				sizes: "180x180",
				type: "image/png",
				purpose: "any",
			},
		],
	};
}
