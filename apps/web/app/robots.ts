import { resolveSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/en/dashboard", "/tl/dashboard"] }],
		sitemap: `${resolveSiteUrl()}/sitemap.xml`,
	};
}
