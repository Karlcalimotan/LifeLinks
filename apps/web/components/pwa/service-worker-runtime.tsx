"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

const SERVICE_WORKER_URL = "/sw.js";

/**
 * Registers the one service worker for the whole console, including the login
 * page. A new worker is never activated automatically: the banner posts
 * SKIP_WAITING only when the operator asks, then reloads on `controllerchange`.
 *
 * The push control registers the same URL; registering twice returns the same
 * registration, so the push flow is unchanged.
 */
export function ServiceWorkerRuntime() {
	const t = useTranslations("pwa.update");
	const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
	const [dismissed, setDismissed] = useState(false);
	const reloading = useRef(false);
	const reloadTimer = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
		};
	}, []);

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		let cancelled = false;

		const watchInstalling = (worker: ServiceWorker | null) => {
			if (!worker) return;
			worker.addEventListener("statechange", () => {
				if (cancelled || worker.state !== "installed") return;
				// With no controller this is the first install, not an update.
				if (!navigator.serviceWorker.controller) return;
				setWaiting(worker);
			});
		};

		const onControllerChange = () => {
			if (!reloading.current) return;
			if (reloadTimer.current !== null) {
				window.clearTimeout(reloadTimer.current);
				reloadTimer.current = null;
			}
			reloading.current = false;
			window.location.reload();
		};

		navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
		navigator.serviceWorker
			.register(SERVICE_WORKER_URL)
			.then((registration) => {
				if (cancelled) return;
				if (registration.waiting && navigator.serviceWorker.controller) {
					setWaiting(registration.waiting);
				}
				watchInstalling(registration.installing);
				registration.addEventListener("updatefound", () => {
					if (!cancelled) watchInstalling(registration.installing);
				});
			})
			.catch(() => {
				// Registration is an enhancement. The console keeps working if the
				// browser refuses it, and the offline shell is simply unavailable.
			});

		return () => {
			cancelled = true;
			navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
		};
	}, []);

	function applyUpdate() {
		if (!waiting) {
			window.location.reload();
			return;
		}
		reloading.current = true;
		waiting.postMessage({ type: "SKIP_WAITING" });
		// Some browsers keep the current page uncontrolled after a takeover.
		// Reload anyway, once, so the banner cannot stay forever.
		reloadTimer.current = window.setTimeout(() => {
			reloadTimer.current = null;
			if (!reloading.current) return;
			reloading.current = false;
			window.location.reload();
		}, 3000);
	}

	if (!waiting || dismissed) return null;

	return (
		<output
			className="fixed inset-x-4 top-4 z-50 block sm:left-auto sm:right-4 sm:w-[22rem]"
			aria-live="polite"
		>
			<div className="rounded-overlay border border-signal-500/40 bg-ink-900 p-4 shadow-overlay">
				<div className="flex items-start gap-3">
					<RefreshCw className="mt-0.5 size-5 shrink-0 text-signal-400" aria-hidden="true" />
					<div className="min-w-0 flex-1">
						<p className="text-body font-medium text-fog-100">{t("title")}</p>
						<p className="mt-0.5 text-meta leading-relaxed text-fog-400">{t("body")}</p>
					</div>
					<button
						type="button"
						onClick={() => setDismissed(true)}
						aria-label={t("dismiss")}
						className="grid size-8 shrink-0 place-items-center rounded-control text-fog-500 transition-colors hover:bg-ink-700 hover:text-fog-100"
					>
						<X className="size-4" aria-hidden="true" />
					</button>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<Button type="button" size="sm" onClick={applyUpdate}>
						<RefreshCw className="size-4" aria-hidden="true" />
						{t("reload")}
					</Button>
					<Button type="button" size="sm" variant="ghost" onClick={() => setDismissed(true)}>
						{t("later")}
					</Button>
				</div>
			</div>
		</output>
	);
}
