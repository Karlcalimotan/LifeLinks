import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const tones: Record<Tone, string> = {
	neutral: "border-slate-700 bg-slate-800/60 text-slate-200",
	success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
	warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	danger: "border-rose-500/30 bg-rose-500/10 text-rose-300",
	info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
	muted: "border-slate-800 bg-slate-900/60 text-slate-400",
};

export function Badge({
	className,
	tone = "neutral",
	...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
				tones[tone],
				className,
			)}
			{...props}
		/>
	);
}
