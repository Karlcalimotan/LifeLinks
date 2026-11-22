export interface TrendBar {
	key: string;
	label: string;
	count: number;
	ariaLabel: string;
}

const WIDTH = 360;
const HEIGHT = 108;
const CHART_HEIGHT = 84;

/**
 * Server-rendered bar chart. Zero days keep a one-pixel baseline so the axis
 * is readable, and every bar carries its date and count in a title.
 */
export function IncidentTrend({ bars, ariaLabel }: { bars: TrendBar[]; ariaLabel: string }) {
	const max = Math.max(1, ...bars.map((bar) => bar.count));
	const slot = bars.length > 0 ? WIDTH / bars.length : WIDTH;
	const barWidth = Math.max(4, slot - 4);

	return (
		<div>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-label={ariaLabel}
				className="block h-auto w-full"
			>
				<title>{ariaLabel}</title>
				<line
					x1={0}
					y1={CHART_HEIGHT + 0.5}
					x2={WIDTH}
					y2={CHART_HEIGHT + 0.5}
					className="stroke-ink-600"
					strokeWidth="1"
				/>
				{bars.map((bar, index) => {
					const height = bar.count === 0 ? 1 : Math.max(4, (bar.count / max) * (CHART_HEIGHT - 4));
					const x = index * slot + (slot - barWidth) / 2;
					return (
						<rect
							key={bar.key}
							x={x}
							y={CHART_HEIGHT - height}
							width={barWidth}
							height={height}
							className={bar.count === 0 ? "fill-ink-700" : "fill-rescue-400"}
						>
							<title>{bar.ariaLabel}</title>
						</rect>
					);
				})}
			</svg>
			<div className="mt-2 flex items-center justify-between gap-3 text-meta text-fog-500">
				<span>{bars[0]?.label}</span>
				<span>{bars.at(-1)?.label}</span>
			</div>
		</div>
	);
}
