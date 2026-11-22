"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

type CopyStatus = "idle" | "copied" | "failed";

export function CopyMac({ value }: { value: string }) {
	const t = useTranslations("devices");
	const [status, setStatus] = useState<CopyStatus>("idle");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setStatus("copied");
		} catch {
			setStatus("failed");
		}
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setStatus("idle"), 2500);
	}

	const announcement =
		status === "copied" ? t("macCopied") : status === "failed" ? t("copyFailed") : "";

	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="font-mono text-meta text-fog-500">{value}</span>
			<button
				type="button"
				onClick={copy}
				aria-label={t("copyMacFor", { mac: value })}
				title={t("copyMac")}
				className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fog-500 transition-colors hover:bg-ink-700 hover:text-fog-100"
			>
				{status === "copied" ? (
					<Check className="size-4" aria-hidden="true" />
				) : (
					<Copy className="size-4" aria-hidden="true" />
				)}
			</button>
			<span className="sr-only" aria-live="polite">
				{announcement}
			</span>
		</span>
	);
}
