import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const tones: Record<Tone, string> = {
	neutral: "border-ink-600 bg-ink-700/70 text-fog-100",
	success: "border-clear-400/30 bg-clear-400/10 text-clear-300",
	warning: "border-caution-400/30 bg-caution-400/10 text-caution-300",
	danger: "border-alarm-400/30 bg-alarm-400/10 text-alarm-300",
	info: "border-rescue-400/30 bg-rescue-400/10 text-rescue-300",
	muted: "border-ink-700 bg-ink-900/70 text-fog-500",
};

export function Badge({
	className,
	tone = "neutral",
	children,
	...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
	return (
		<span
			className={cn(
				"inline-flex w-fit items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[11px] font-medium",
				tones[tone],
				className,
			)}
			{...props}
		>
			<span className="size-1.5 shrink-0 rounded-[1px] bg-current" aria-hidden="true" />
			{children}
		</span>
	);
}
