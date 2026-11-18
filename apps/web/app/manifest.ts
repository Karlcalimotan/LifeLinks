import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: `${APP_NAME} — Fleet safety`,
		short_name: APP_NAME,
		description: APP_TAGLINE,
		start_url: "/en/dashboard",
		display: "standalone",
		background_color: "#071013",
		theme_color: "#071013",
		icons: [{ src: "/logo-mark.svg", sizes: "any", type: "image/svg+xml" }],
	};
}
