"use client";

import { usePathname, useRouter } from "@/i18n/routing";
import { type Locale, locales } from "@/i18n/routing";
import { useLocale } from "next-intl";

export function LocaleSwitcher() {
	const locale = useLocale();
	const pathname = usePathname();
	const router = useRouter();

	return (
		<select
			aria-label="Language"
			value={locale}
			onChange={(event) => {
				router.replace(pathname, { locale: event.target.value as Locale });
			}}
			className="h-8 rounded border border-ink-600/80 bg-ink-950/60 px-2 text-xs text-fog-300 focus:border-signal-500 focus:outline-none"
		>
			{locales.map((entry) => (
				<option key={entry} value={entry}>
					{entry.toUpperCase()}
				</option>
			))}
		</select>
	);
}
