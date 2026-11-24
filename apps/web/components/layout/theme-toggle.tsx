"use client";

import { THEME_COOKIE, type ThemePreference, resolveTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type ThemeLabels = {
	label: string;
	light: string;
	dark: string;
	system: string;
};

const options = [
	{ value: "light", icon: Sun, labelKey: "light" },
	{ value: "dark", icon: Moon, labelKey: "dark" },
	{ value: "system", icon: Monitor, labelKey: "system" },
] as const;

const THEME_EVENT = "ll:themechange";

function applyPreference(preference: ThemePreference, persist: boolean) {
	const root = document.documentElement;
	const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
	const resolved = resolveTheme(preference, prefersLight);

	root.dataset.theme = resolved;
	root.dataset.themePreference = preference;
	root.style.colorScheme = resolved;

	if (persist) {
		document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=31536000; samesite=lax`;
	}

	window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle({
	initialPreference,
	labels,
	size = "sm",
}: {
	initialPreference: ThemePreference;
	labels: ThemeLabels;
	size?: "sm" | "md";
}) {
	const [preference, setPreference] = useState(initialPreference);

	useEffect(() => {
		applyPreference(initialPreference, false);
	}, [initialPreference]);

	useEffect(() => {
		if (preference !== "system") return;

		const query = window.matchMedia("(prefers-color-scheme: light)");
		const sync = () => applyPreference("system", false);
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, [preference]);

	const choose = useCallback((next: ThemePreference) => {
		setPreference(next);
		applyPreference(next, true);
	}, []);

	return (
		<fieldset className="m-0 inline-flex min-w-0 items-center gap-0.5 rounded-control border border-ink-600/80 bg-ink-950/60 p-0.5">
			<legend className="sr-only">{labels.label}</legend>
			{options.map(({ value, icon: Icon, labelKey }) => {
				const active = preference === value;
				return (
					<button
						key={value}
						type="button"
						onClick={() => choose(value)}
						aria-pressed={active}
						aria-label={labels[labelKey]}
						title={labels[labelKey]}
						className={cn(
							"grid place-items-center rounded-[2px] transition-colors",
							size === "md" ? "size-11" : "size-7",
							active
								? "bg-ink-700 text-fog-50"
								: "text-fog-500 hover:bg-ink-800 hover:text-fog-100",
						)}
					>
						<Icon className={size === "md" ? "size-4" : "size-3.5"} aria-hidden="true" />
					</button>
				);
			})}
		</fieldset>
	);
}
