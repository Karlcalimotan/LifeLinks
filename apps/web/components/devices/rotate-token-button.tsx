"use client";

import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { Button } from "@/components/ui/button";
import { type DeviceTokenState, rotateDeviceTokenAction } from "@/lib/actions/devices";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";

const initial: DeviceTokenState = { ok: false };

export function RotateTokenButton({
	deviceId,
	label,
	locale,
}: {
	deviceId: string;
	label: string;
	locale: string;
}) {
	const t = useTranslations("devices");
	const common = useTranslations("common");
	const [state, formAction, pending] = useActionState(rotateDeviceTokenAction, initial);
	const retryMinutes = Math.max(1, Math.ceil((state.retryAfterSeconds ?? 600) / 60));

	return (
		<div className="flex flex-col gap-3">
			<form action={formAction}>
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="deviceId" value={deviceId} />
				<ConfirmSubmit
					message={t("confirmRotateToken", { label })}
					confirmLabel={t("rotateToken")}
					cancelLabel={common("cancel")}
					variant="outline"
					disabled={pending}
				>
					<RefreshCw className="size-4" aria-hidden="true" />
					{t("rotateToken")}
				</ConfirmSubmit>
			</form>

			{state.errorCode === "rate_limited" ? (
				<p
					role="alert"
					className="rounded border border-alarm-500/30 bg-alarm-500/10 px-3 py-2 text-meta text-alarm-300"
				>
					{t("rotateRateLimited", { minutes: retryMinutes })}
				</p>
			) : state.error ? (
				<p
					role="alert"
					className="rounded border border-alarm-500/30 bg-alarm-500/10 px-3 py-2 text-meta text-alarm-300"
				>
					{state.error}
				</p>
			) : null}

			{state.ok && state.token ? <TokenReveal key={state.token} token={state.token} /> : null}
		</div>
	);
}

/**
 * The only place a token is rendered. It keeps the secret in component state
 * for this response only: no URL, storage, log or refreshed page contains it.
 */
function TokenReveal({ token }: { token: string }) {
	const t = useTranslations("devices");
	const common = useTranslations("common");
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	async function copyToken() {
		try {
			await navigator.clipboard.writeText(token);
			setStatus("copied");
		} catch {
			setStatus("failed");
		}
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setStatus("idle"), 2500);
	}

	return (
		<div className="rounded border border-caution-400/30 bg-caution-400/10 p-4">
			<p className="text-body font-semibold text-caution-300">{t("tokenShown")}</p>
			<p className="mt-1 text-meta text-caution-300">{t("tokenReplaced")}</p>
			<div className="mt-2 flex items-center gap-2">
				<code className="min-w-0 flex-1 overflow-x-auto rounded-control border border-caution-400/20 bg-ink-950/60 px-3 py-2 font-mono text-meta text-caution-300">
					{token}
				</code>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={copyToken}
					aria-label={t("copyToken")}
				>
					{status === "copied" ? (
						<Check className="size-4" aria-hidden="true" />
					) : (
						<Copy className="size-4" aria-hidden="true" />
					)}
					{status === "copied" ? common("copied") : common("copy")}
				</Button>
			</div>
			{status === "failed" ? (
				<p role="alert" className="mt-2 text-meta text-alarm-300">
					{t("copyTokenFailed")}
				</p>
			) : null}
			<span className="sr-only" aria-live="polite">
				{status === "copied" ? t("tokenCopied") : ""}
			</span>
		</div>
	);
}
