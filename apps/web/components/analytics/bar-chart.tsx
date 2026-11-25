import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export interface BarChartDatum {
	key: string;
	label: string;
	value: number;
	description: string;
}

/**
 * Vertical bars with a value above every bar and a label below the axis, so the
 * data is readable without relying on colour. The bars are decorative; the
 * screen-reader list carries the same values with their full date or hour.
 */
export function BarChart({
	title,
	data,
	tickEvery = 1,
}: {
	title: string;
	data: BarChartDatum[];
	tickEvery?: number;
}) {
	const max = Math.max(1, ...data.map((datum) => datum.value));

	return (
		<figure className="m-0">
			<figcaption className="sr-only">{title}</figcaption>
			<div className="relative">
				{/* biome-ignore lint/a11y/noNoninteractiveTabindex: the chart scrolls horizontally, so keyboard users need to reach it */}
				<section className="overflow-x-auto" tabIndex={0} aria-label={title}>
					<div className="min-w-full">
						<div className="flex gap-1" aria-hidden="true">
							{data.map((datum) => (
								<span
									key={datum.key}
									className={cn(
										"min-w-6 flex-1 text-center text-meta leading-none tabular-nums",
										datum.value > 0 ? "text-fog-100" : "text-fog-500",
									)}
								>
									{datum.value}
								</span>
							))}
						</div>
						<div
							className="mt-1 flex h-32 items-end gap-1 border-b border-ink-700"
							aria-hidden="true"
						>
							{data.map((datum) => (
								<span key={datum.key} className="flex h-full min-w-6 flex-1 items-end">
									<span
										className="block w-full rounded-[1px] bg-rescue-400"
										style={{ height: `${(datum.value / max) * 100}%` }}
										title={datum.description}
									/>
								</span>
							))}
						</div>
						<div className="mt-2 flex gap-1" aria-hidden="true">
							{data.map((datum, index) => (
								<span key={datum.key} className="min-w-6 flex-1 text-center text-meta text-fog-500">
									{index % tickEvery === 0 || index === data.length - 1 ? datum.label : ""}
								</span>
							))}
						</div>
					</div>
				</section>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 rounded-l-control bg-ink-800 p-1 text-fog-500 sm:hidden"
				>
					<ChevronRight className="size-4" />
				</span>
			</div>
			<ul className="sr-only">
				{data.map((datum) => (
					<li key={datum.key}>{datum.description}</li>
				))}
			</ul>
		</figure>
	);
}
