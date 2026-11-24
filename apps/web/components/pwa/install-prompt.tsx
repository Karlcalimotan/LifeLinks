"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type BeforeInstallPromptLike,
	type InstallSurface,
	canPromptInstall,
	dismissInstall,
	isInstallDismissed,
	isIosDevice,
	isStandalone,
	resolveInstallSurface,
} from "@/lib/pwa/install";
import { Download, Share2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

type InstallPromptEvent = Event & BeforeInstallPromptLike;

/*
 * `beforeinstallprompt` can fire before React hydrates. Capture it at module
 * load, then let the provider read the captured event on mount. Without this,
 * a fast browser would show no install control at all.
 */
let capturedPrompt: InstallPromptEvent | null = null;
let appInstalled = false;
let captureBound = false;
const captureSubscribers = new Set<() => void>();

function notifyCaptureSubscribers() {
	for (const notify of captureSubscribers) notify();
}

function bindCapture() {
	if (captureBound || typeof window === "undefined") return;
	captureBound = true;
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		capturedPrompt = event as InstallPromptEvent;
		notifyCaptureSubscribers();
	});
	window.addEventListener("appinstalled", () => {
		appInstalled = true;
		capturedPrompt = null;
		notifyCaptureSubscribers();
	});
}

bindCapture();

interface InstallPromptValue {
	ready: boolean;
	surface: InstallSurface;
	dismissed: boolean;
	promptInstall(): Promise<void>;
	dismissBanner(): void;
}

const InstallPromptContext = createContext<InstallPromptValue | null>(null);

function browserStorage(): Storage | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

export function InstallPromptProvider({ children }: { children: ReactNode }) {
	const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
	const [ios, setIos] = useState(false);
	const [standalone, setStandalone] = useState(false);
	const [installed, setInstalled] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const syncCaptured = () => {
			setPromptEvent(capturedPrompt);
			setInstalled(appInstalled);
		};
		syncCaptured();
		captureSubscribers.add(syncCaptured);
		return () => {
			captureSubscribers.delete(syncCaptured);
		};
	}, []);

	useEffect(() => {
		const media = window.matchMedia("(display-mode: standalone)");
		const nav = navigator as Navigator & { standalone?: boolean };
		const syncStandalone = () => {
			setStandalone(
				isStandalone({
					displayModeStandalone: media.matches,
					navigatorStandalone: nav.standalone,
				}),
			);
		};

		syncStandalone();
		setIos(
			isIosDevice({
				userAgent: navigator.userAgent,
				platform: navigator.platform,
				maxTouchPoints: navigator.maxTouchPoints,
			}),
		);
		setDismissed(isInstallDismissed(browserStorage()));
		setReady(true);

		media.addEventListener("change", syncStandalone);
		return () => media.removeEventListener("change", syncStandalone);
	}, []);

	const promptInstall = useCallback(async () => {
		if (!canPromptInstall(promptEvent)) return;
		try {
			await promptEvent.prompt();
			// The event can only be used once. Drop it even if the user cancels,
			// so the page never shows a button that cannot work.
			await promptEvent.userChoice;
			setPromptEvent(null);
		} catch {
			setPromptEvent(null);
		}
	}, [promptEvent]);

	const dismissBanner = useCallback(() => {
		setDismissed(true);
		dismissInstall(browserStorage());
	}, []);

	const surface = resolveInstallSurface({
		standalone: standalone || installed,
		ios,
		canPrompt: canPromptInstall(promptEvent),
	});

	const value = useMemo<InstallPromptValue>(
		() => ({ ready, surface, dismissed, promptInstall, dismissBanner }),
		[ready, surface, dismissed, promptInstall, dismissBanner],
	);

	return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

function useInstallPrompt(): InstallPromptValue {
	const value = useContext(InstallPromptContext);
	if (!value) throw new Error("Install UI must be rendered inside InstallPromptProvider.");
	return value;
}

/** Dismissible install banner for the dashboard. */
export function InstallBanner() {
	const t = useTranslations("pwa.install");
	const { ready, surface, dismissed, promptInstall, dismissBanner } = useInstallPrompt();

	if (!ready || dismissed || surface === "installed" || surface === "unavailable") return null;

	const ios = surface === "ios";
	const Icon = ios ? Share2 : Download;

	return (
		<section
			className="mb-4 flex items-start gap-3 rounded-panel border border-signal-500/35 bg-ink-800 px-4 py-3"
			aria-label={t("bannerTitle")}
		>
			<Icon className="mt-0.5 size-5 shrink-0 text-signal-400" aria-hidden="true" />
			<div className="min-w-0 flex-1">
				<p className="text-body font-medium text-fog-100">
					{ios ? t("iosTitle") : t("bannerTitle")}
				</p>
				<p className="mt-0.5 text-meta leading-relaxed text-fog-400">
					{ios ? t("iosBannerBody") : t("bannerBody")}
				</p>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{ios ? null : (
						<Button type="button" size="sm" onClick={() => void promptInstall()}>
							{t("install")}
						</Button>
					)}
					<Button type="button" size="sm" variant="ghost" onClick={dismissBanner}>
						{t("dismiss")}
					</Button>
				</div>
			</div>
			<button
				type="button"
				onClick={dismissBanner}
				aria-label={t("dismissBanner")}
				className="grid size-8 shrink-0 place-items-center rounded-control text-fog-500 transition-colors hover:bg-ink-700 hover:text-fog-100"
			>
				<X className="size-4" aria-hidden="true" />
			</button>
		</section>
	);
}

/** Settings card. Hidden once the app runs as an installed standalone window. */
export function InstallCard() {
	const t = useTranslations("pwa.install");
	const { ready, surface, promptInstall } = useInstallPrompt();

	if (!ready || surface === "installed") return null;

	const ios = surface === "ios";
	const unavailable = surface === "unavailable";

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{ios ? t("iosTitle") : unavailable ? t("unavailableTitle") : t("cardTitle")}
				</CardTitle>
				<CardDescription>
					{ios ? t("iosBody") : unavailable ? t("unavailableBody") : t("cardBody")}
				</CardDescription>
			</CardHeader>
			{ios || unavailable ? null : (
				<CardContent>
					<Button type="button" size="sm" onClick={() => void promptInstall()}>
						<Download className="size-4" aria-hidden="true" />
						{t("install")}
					</Button>
				</CardContent>
			)}
		</Card>
	);
}
