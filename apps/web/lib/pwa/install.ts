/**
 * Pure install-prompt helpers.
 *
 * The browser objects are passed in so the decisions are testable in jsdom and
 * the component stays small. Nothing here reads storage or touches globals.
 */

export const INSTALL_DISMISS_KEY = "lifelink.pwa.install.dismissed";
export const INSTALL_DISMISS_DAYS = 30;

export interface BeforeInstallPromptLike {
	prompt(): Promise<void>;
	userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallSurface = "installed" | "prompt" | "ios" | "unavailable";

export function isStandalone({
	displayModeStandalone,
	navigatorStandalone,
}: {
	displayModeStandalone: boolean;
	navigatorStandalone?: boolean;
}): boolean {
	return displayModeStandalone || navigatorStandalone === true;
}

/** iPadOS reports a Mac user agent, so the touch count is part of the check. */
export function isIosDevice({
	userAgent,
	platform,
	maxTouchPoints,
}: {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
}): boolean {
	if (/iphone|ipad|ipod/i.test(userAgent)) return true;
	return platform === "MacIntel" && maxTouchPoints > 1;
}

export function canPromptInstall(
	event: BeforeInstallPromptLike | null | undefined,
): event is BeforeInstallPromptLike {
	return Boolean(event && typeof event.prompt === "function");
}

/**
 * Which install surface the page should show.
 *
 * Already-installed wins over everything. A real browser prompt wins over the
 * iOS instructions, because iOS never fires `beforeinstallprompt`.
 */
export function resolveInstallSurface({
	standalone,
	ios,
	canPrompt,
}: {
	standalone: boolean;
	ios: boolean;
	canPrompt: boolean;
}): InstallSurface {
	if (standalone) return "installed";
	if (canPrompt) return "prompt";
	if (ios) return "ios";
	return "unavailable";
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/** A dismissal expires so a later release can ask again. */
export function isInstallDismissed(
	storage: ReadableStorage | undefined,
	now = Date.now(),
): boolean {
	if (!storage) return false;
	try {
		const raw = storage.getItem(INSTALL_DISMISS_KEY);
		if (!raw) return false;
		const dismissedAt = Number.parseInt(raw, 10);
		if (!Number.isFinite(dismissedAt)) return false;
		return now - dismissedAt < INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
	} catch {
		return false;
	}
}

export function dismissInstall(storage: WritableStorage | undefined, now = Date.now()): void {
	if (!storage) return;
	try {
		storage.setItem(INSTALL_DISMISS_KEY, String(now));
	} catch {
		// A browser with storage disabled still gets the in-memory dismissal.
	}
}
