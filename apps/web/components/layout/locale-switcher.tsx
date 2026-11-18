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
			className="h-8 rounded-lg border border-slate-700/80 bg-slate-950/60 px-2 text-xs text-slate-300 focus:border-brand-500 focus:outline-none"
		>
			{locales.map((entry) => (
				<option key={entry} value={entry}>
					{entry.toUpperCase()}
				</option>
			))}
		</select>
	);
}
