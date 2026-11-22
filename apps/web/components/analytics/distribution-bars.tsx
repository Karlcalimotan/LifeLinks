import { cn } from "@/lib/utils";

export interface DistributionItem {
	key: string;
	label: React.ReactNode;
	value: number;
	valueLabel: string;
	barClassName: string;
}

/** Horizontal bars with the label and the value written next to each row. */
export function DistributionBars({ title, items }: { title: string; items: DistributionItem[] }) {
	const max = Math.max(1, ...items.map((item) => item.value));

	return (
		<ul aria-label={title} className="flex flex-col gap-3">
			{items.map((item) => (
				<li key={item.key}>
					<div className="flex items-baseline justify-between gap-3">
						<span className="min-w-0 truncate text-body text-fog-100">{item.label}</span>
						<span className="shrink-0 text-meta text-fog-500 tabular-nums">{item.valueLabel}</span>
					</div>
					<div
						className="mt-1 h-1.5 w-full overflow-hidden rounded-[1px] bg-ink-700"
						aria-hidden="true"
					>
						<span
							className={cn("block h-full rounded-[1px]", item.barClassName)}
							style={{ width: `${(item.value / max) * 100}%` }}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}
