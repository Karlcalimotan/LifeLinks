import { Link } from "@/i18n/routing";
import { ANALYTICS_RANGES, type AnalyticsRange } from "@/lib/analytics/aggregate";
import { cn } from "@/lib/utils";

export function RangeSelector({
	active,
	labels,
	ariaLabel,
}: {
	active: AnalyticsRange;
	labels: Record<AnalyticsRange, string>;
	ariaLabel: string;
}) {
	return (
		<nav aria-label={ariaLabel} className="flex flex-wrap items-center gap-1">
			{ANALYTICS_RANGES.map((range) => (
				<Link
					key={range}
					href={`/analytics?range=${range}`}
					aria-current={range === active ? "page" : undefined}
					className={cn(
						"inline-flex h-10 items-center rounded-control border px-3 text-meta transition-colors sm:h-8",
						range === active
							? "border-signal-500/40 bg-signal-500/10 text-signal-300"
							: "border-ink-700 text-fog-500 hover:border-ink-600 hover:text-fog-100",
					)}
				>
					{labels[range]}
				</Link>
			))}
		</nav>
	);
}
