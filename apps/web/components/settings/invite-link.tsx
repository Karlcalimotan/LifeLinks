"use client";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/**
 * The invitation link is a capability. It is shown once, in this response, and
 * is not persisted in the page, a cookie or the database. There is no email
 * sender in this deployment, so the panel says plainly that the admin has to
 * send it.
 */
export function InviteLink({
	url,
	expiresAt,
	locale,
}: {
	url: string;
	expiresAt?: string;
	locale: string;
}) {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url);
			setStatus("copied");
		} catch {
			setStatus("failed");
		}
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setStatus("idle"), 2500);
	}

	return (
		<div className="rounded-panel border border-caution-400/30 bg-caution-400/10 p-4">
			<p className="text-body font-semibold text-caution-300">{t("inviteLinkTitle")}</p>
			<p className="mt-1 text-meta leading-relaxed text-caution-300">{t("inviteLinkNoEmail")}</p>
			<div className="mt-2 flex items-center gap-2">
				<code className="min-w-0 flex-1 overflow-x-auto rounded-control border border-caution-400/20 bg-ink-950/60 px-3 py-2 font-mono text-meta text-caution-300">
					{url}
				</code>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={copyLink}
					aria-label={t("inviteCopyLink")}
				>
					{status === "copied" ? (
						<Check className="size-4" aria-hidden="true" />
					) : (
						<Copy className="size-4" aria-hidden="true" />
					)}
					{status === "copied" ? common("copied") : common("copy")}
				</Button>
			</div>
			{expiresAt ? (
				<p className="mt-2 text-meta text-caution-300/80">
					{t("inviteLinkExpiry", { date: formatDateTime(expiresAt, locale) })}
				</p>
			) : null}
			{status === "failed" ? (
				<p role="alert" className="mt-2 text-meta text-alarm-300">
					{t("inviteCopyFailed")}
				</p>
			) : null}
			<span className="sr-only" aria-live="polite">
				{status === "copied" ? t("inviteLinkCopied") : ""}
			</span>
		</div>
	);
}
