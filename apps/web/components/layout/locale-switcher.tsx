"use client";

import { usePathname, useRouter } from "@/i18n/routing";
import { type Locale, locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";

export function LocaleSwitcher({
	label = "Language",
	className,
}: {
	label?: string;
	className?: string;
}) {
	const locale = useLocale();
	const pathname = usePathname();
	const router = useRouter();

	return (
		<select
			aria-label={label}
			value={locale}
			onChange={(event) => {
				router.replace(pathname, { locale: event.target.value as Locale });
			}}
			className={cn(
				"h-11 rounded border border-ink-600/80 bg-ink-950/60 px-2 text-base text-fog-300 focus:border-signal-500 focus:outline-none sm:h-8 sm:text-xs",
				className,
			)}
		>
			{locales.map((entry) => (
				<option key={entry} value={entry}>
					{entry.toUpperCase()}
				</option>
			))}
		</select>
	);
}
