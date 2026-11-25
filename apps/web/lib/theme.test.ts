import { describe, expect, it } from "vitest";
import { parseThemePreference, resolveTheme } from "./theme";

describe("parseThemePreference", () => {
	it("accepts every known preference", () => {
		expect(parseThemePreference("light")).toBe("light");
		expect(parseThemePreference("dark")).toBe("dark");
		expect(parseThemePreference("system")).toBe("system");
	});

	it("falls back to system for missing or unknown values", () => {
		expect(parseThemePreference(undefined)).toBe("system");
		expect(parseThemePreference(null)).toBe("system");
		expect(parseThemePreference("")).toBe("system");
		expect(parseThemePreference("solarized")).toBe("system");
		expect(parseThemePreference("Light")).toBe("system");
	});
});

describe("resolveTheme", () => {
	it("follows the operating system for the system preference", () => {
		expect(resolveTheme("system", true)).toBe("light");
		expect(resolveTheme("system", false)).toBe("dark");
	});

	it("keeps an explicit choice regardless of the operating system", () => {
		expect(resolveTheme("light", false)).toBe("light");
		expect(resolveTheme("dark", true)).toBe("dark");
	});
});
