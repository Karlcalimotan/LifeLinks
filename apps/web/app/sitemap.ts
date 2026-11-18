import { resolveSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
	const base = resolveSiteUrl();
	return [
		{ url: `${base}/en/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
		{
			url: `${base}/en/privacy`,
			lastModified: new Date(),
			changeFrequency: "yearly",
			priority: 0.3,
		},
		{ url: `${base}/en/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
	];
}
