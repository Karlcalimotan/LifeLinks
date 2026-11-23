"use client";

import { Button } from "@/components/ui/button";
import {
	type PushClientState,
	currentPushSubscription,
	isPushSupported,
	resolvePushClientState,
	subscribeToPush,
	unsubscribeFromPush,
} from "@/lib/push/client";
import { BellOff, BellRing, LoaderCircle, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

// Next inlines NEXT_PUBLIC_* at build time. An empty value means the server has
// no VAPID keypair, and the control says so instead of failing on click.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type PushStatus = PushClientState | "checking" | "working" | "error";

function browserSupportsPush(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof navigator !== "undefined" &&
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window &&
		isPushSupported(navigator.serviceWorker)
	);
}

async function changeSubscription(method: "POST" | "DELETE", body: unknown): Promise<Response> {
	return fetch("/api/push/subscribe", {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

export function PushToggle() {
	const t = useTranslations("push");
	const locale = useLocale();
	const [status, setStatus] = useState<PushStatus>("checking");

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const supported = browserSupportsPush();
			const container = supported ? navigator.serviceWorker : undefined;
			const subscription = supported
				? await currentPushSubscription(container).catch(() => null)
				: null;
			if (cancelled) return;
			setStatus(
				resolvePushClientState({
					supported,
					configured: VAPID_PUBLIC_KEY.trim().length > 0,
					permission: supported ? Notification.permission : "default",
					subscribed: subscription !== null,
				}),
			);
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	async function enable() {
		setStatus("working");
		try {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setStatus(
					resolvePushClientState({
						supported: true,
						configured: true,
						permission,
						subscribed: false,
					}),
				);
				return;
			}

			const subscription = await subscribeToPush(navigator.serviceWorker, VAPID_PUBLIC_KEY);
			const response = await changeSubscription("POST", { ...subscription, locale });
			if (response.status === 503) {
				// The server knows whether the private key is present; the browser
				// only ever sees the public one.
				setStatus("unconfigured");
				return;
			}
			if (!response.ok) throw new Error("Subscription was not saved.");
			setStatus("subscribed");
		} catch {
			setStatus("error");
		}
	}

	async function disable() {
		setStatus("working");
		try {
			const endpoint = await unsubscribeFromPush(navigator.serviceWorker);
			if (endpoint) {
				const response = await changeSubscription("DELETE", { endpoint });
				if (!response.ok) throw new Error("Subscription was not revoked.");
			}
			setStatus("idle");
		} catch {
			// The browser subscription is already gone. The server row will be
			// removed when the push service reports the endpoint as gone.
			setStatus("idle");
		}
	}

	const busy = status === "checking" || status === "working";
	const message = (() => {
		switch (status) {
			case "checking":
				return t("checking");
			case "working":
				return t("working");
			case "unsupported":
				return t("unsupported");
			case "unconfigured":
				return t("unconfigured");
			case "denied":
				return t("denied");
			case "subscribed":
				return t("subscribed");
			case "error":
				return t("error");
			default:
				return t("hint");
		}
	})();

	const Icon =
		status === "denied" || status === "unsupported" || status === "unconfigured"
			? BellOff
			: status === "error"
				? TriangleAlert
				: BellRing;

	return (
		<div className="border-t border-ink-700 px-4 py-3">
			<p className="flex items-center gap-1.5 text-meta font-medium text-fog-100">
				<Icon className="size-3.5 shrink-0 text-signal-400" aria-hidden="true" />
				{t("title")}
			</p>
			<p
				aria-live="polite"
				className="mt-1 flex items-start gap-1.5 text-meta leading-relaxed text-fog-500"
			>
				{busy ? (
					<LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin" aria-hidden="true" />
				) : null}
				<span>{message}</span>
			</p>

			{status === "idle" || status === "error" ? (
				<Button type="button" size="sm" variant="secondary" className="mt-2" onClick={enable}>
					{status === "error" ? t("retry") : t("enable")}
				</Button>
			) : null}

			{status === "subscribed" ? (
				<Button type="button" size="sm" variant="ghost" className="mt-2" onClick={disable}>
					{t("disable")}
				</Button>
			) : null}
		</div>
	);
}
