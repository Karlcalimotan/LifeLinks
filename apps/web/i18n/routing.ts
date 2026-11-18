import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

export const locales = ["en", "tl"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const routing = defineRouting({
	locales,
	defaultLocale,
	localePrefix: "always",
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
