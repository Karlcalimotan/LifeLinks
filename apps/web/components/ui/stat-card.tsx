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
		<Card className="relative overflow-hidden p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
						{label}
					</p>
					<p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
					{hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
				</div>
				<span
					className={cn(
						"grid size-10 place-items-center rounded-xl border",
						tone === "danger"
							? "border-rose-500/30 bg-rose-500/10 text-rose-300"
							: tone === "success"
								? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
								: "border-slate-700 bg-slate-900 text-slate-400",
					)}
				>
					<Icon className="size-4" />
				</span>
			</div>
		</Card>
	);
}
