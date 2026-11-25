export const THEME_COOKIE = "ll_theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

/** Unknown or missing cookie values fall back to following the OS. */
export function parseThemePreference(value: string | null | undefined): ThemePreference {
	return THEME_PREFERENCES.find((preference) => preference === value) ?? "system";
}

export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
	if (preference === "system") return prefersLight ? "light" : "dark";
	return preference;
}
