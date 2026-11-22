import "server-only";

import { PAGE_TITLES, type PageTitleRoute } from "@/lib/page-titles";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Shared `generateMetadata` body for the eight console routes. */
export async function metadataForPage(locale: string, route: PageTitleRoute): Promise<Metadata> {
	const entry = PAGE_TITLES[route];
	const t = await getTranslations({ locale, namespace: entry.namespace });
	return { title: t(entry.key) };
}
