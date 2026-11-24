import { describe, expect, it } from "vitest";
import {
	INSTALL_DISMISS_DAYS,
	INSTALL_DISMISS_KEY,
	canPromptInstall,
	dismissInstall,
	isInstallDismissed,
	isIosDevice,
	isStandalone,
	resolveInstallSurface,
} from "./install";

describe("install prompt helpers", () => {
	it("treats the standalone display mode and iOS navigator flag as installed", () => {
		expect(isStandalone({ displayModeStandalone: true })).toBe(true);
		expect(isStandalone({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true);
		expect(isStandalone({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false);
		expect(isStandalone({ displayModeStandalone: false })).toBe(false);
	});

	it("detects iPhone, iPad and iPadOS with a desktop user agent", () => {
		const touch = { platform: "iPhone", maxTouchPoints: 5 };
		expect(isIosDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", ...touch })).toBe(
			true,
		);
		expect(isIosDevice({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0)", ...touch })).toBe(true);
		expect(
			isIosDevice({
				userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
				platform: "MacIntel",
				maxTouchPoints: 2,
			}),
		).toBe(true);
		expect(
			isIosDevice({
				userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				platform: "Win32",
				maxTouchPoints: 0,
			}),
		).toBe(false);
		expect(
			isIosDevice({
				userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
				platform: "MacIntel",
				maxTouchPoints: 0,
			}),
		).toBe(false);
	});

	it("only accepts an event that can actually prompt", () => {
		expect(canPromptInstall({ prompt: async () => {} })).toBe(true);
		expect(canPromptInstall(null)).toBe(false);
		expect(canPromptInstall(undefined)).toBe(false);
		expect(canPromptInstall({ prompt: "install" } as never)).toBe(false);
	});

	it("lets an installed window win, then the real prompt, then iOS", () => {
		expect(resolveInstallSurface({ standalone: true, ios: true, canPrompt: true })).toBe(
			"installed",
		);
		expect(resolveInstallSurface({ standalone: false, ios: true, canPrompt: true })).toBe("prompt");
		expect(resolveInstallSurface({ standalone: false, ios: true, canPrompt: false })).toBe("ios");
		expect(resolveInstallSurface({ standalone: false, ios: false, canPrompt: false })).toBe(
			"unavailable",
		);
	});

	it("expires a banner dismissal after the quiet period", () => {
		const store = new Map<string, string>();
		const storage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
		};
		const now = 1_700_000_000_000;

		expect(isInstallDismissed(storage, now)).toBe(false);
		dismissInstall(storage, now);
		expect(store.get(INSTALL_DISMISS_KEY)).toBe(String(now));
		expect(isInstallDismissed(storage, now)).toBe(true);
		const afterQuietPeriod = now + INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000 + 1;
		expect(isInstallDismissed(storage, afterQuietPeriod)).toBe(false);
	});
});
