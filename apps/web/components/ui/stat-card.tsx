import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
	label,
	value,
	hint,
	icon: Icon,
	tone = "default",
}: {
	label: string;
	value: string | number;
	hint?: string;
	icon: LucideIcon;
	tone?: "default" | "danger" | "success";
}) {
	return (
		<Card className="relative overflow-hidden px-4 py-4">
			{tone === "danger" ? (
				<span className="absolute inset-x-0 top-0 h-0.5 bg-alarm-500" aria-hidden="true" />
			) : tone === "success" ? (
				<span className="absolute inset-x-0 top-0 h-0.5 bg-clear-400" aria-hidden="true" />
			) : (
				<span className="absolute inset-x-0 top-0 h-0.5 bg-ink-600" aria-hidden="true" />
			)}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[11px] font-medium text-fog-500">{label}</p>
					<p className="mt-1.5 font-display text-4xl leading-none tracking-tight text-fog-50 tabular-nums">
						{value}
					</p>
					{hint ? <p className="mt-1 truncate text-[11px] text-fog-500">{hint}</p> : null}
				</div>
				<span
					className={cn(
						"grid size-8 shrink-0 place-items-center rounded-[3px] border",
						tone === "danger"
							? "border-alarm-400/30 bg-alarm-400/10 text-alarm-300"
							: tone === "success"
								? "border-clear-400/30 bg-clear-400/10 text-clear-300"
								: "border-ink-600 bg-ink-900 text-fog-500",
					)}
				>
					<Icon className="size-4" />
				</span>
			</div>
		</Card>
	);
}
