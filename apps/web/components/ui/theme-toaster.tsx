"use client";

import type { ResolvedTheme } from "@/lib/theme";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";

/** Sonner needs the resolved theme as a prop, not only CSS variables. */
export function ThemeToaster() {
	const [theme, setTheme] = useState<ResolvedTheme>("dark");

	useEffect(() => {
		const sync = () => {
			setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
		};

		sync();
		window.addEventListener("ll:themechange", sync);
		return () => window.removeEventListener("ll:themechange", sync);
	}, []);

	return (
		<Toaster
			theme={theme}
			position="top-right"
			toastOptions={{
				style: {
					background: "var(--color-ink-800)",
					border: "1px solid var(--color-ink-600)",
					color: "var(--color-fog-100)",
					borderRadius: "var(--radius-panel)",
					fontFamily: "var(--font-barlow), sans-serif",
				},
			}}
		/>
	);
}
