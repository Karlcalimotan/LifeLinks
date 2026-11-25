import "server-only";
import { THEME_COOKIE, type ThemePreference, parseThemePreference } from "@/lib/theme";
import { cookies } from "next/headers";

/**
 * Reads the persisted appearance preference. The layout renders the explicit
 * choice on <html> so the first paint is correct; a beforeInteractive script
 * resolves `system` before hydration.
 */
export async function readThemePreference(): Promise<ThemePreference> {
	const store = await cookies();
	return parseThemePreference(store.get(THEME_COOKIE)?.value);
}
