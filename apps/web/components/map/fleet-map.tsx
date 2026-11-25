import { Link } from "@/i18n/routing";
import { type FleetMarkerState, fleetMapBounds, projectToMap } from "@/lib/dashboard/metrics";

const WIDTH = 640;
const HEIGHT = 360;
const PADDING = 48;
const EDGE_LABEL = 84;

const markerCore: Record<FleetMarkerState, string> = {
	incident: "fill-alarm-500 stroke-ink-950",
	online: "fill-clear-400 stroke-ink-950",
	weak: "fill-caution-400 stroke-ink-950",
	offline: "fill-ink-900 stroke-alarm-400",
	stale: "fill-ink-900 stroke-fog-400",
};

const legendDot: Record<FleetMarkerState, string> = {
	incident: "bg-alarm-500",
	online: "bg-clear-400",
	weak: "bg-caution-400",
	offline: "border border-alarm-400",
	stale: "border border-fog-400",
};

export interface FleetMapMarker {
	id: string;
	href: string;
	plateNo: string;
	state: FleetMarkerState;
	stateLabel: string;
	detail: string;
	lat: number;
	lng: number;
}

export interface FleetMapLegendItem {
	state: FleetMarkerState;
	label: string;
}

/**
 * An offline schematic map. It plots the last fix relative to the other
 * vehicles in the fleet: no tiles, no network calls, and a stale fix keeps its
 * place with a muted marker instead of pretending to be live.
 */
export function FleetMap({
	markers,
	legend,
	ariaLabel,
}: {
	markers: FleetMapMarker[];
	legend: FleetMapLegendItem[];
	ariaLabel: string;
}) {
	const bounds = fleetMapBounds(markers);
	const points = markers.map((marker) => ({
		...marker,
		...projectToMap(marker, bounds, { width: WIDTH, height: HEIGHT }, PADDING),
	}));

	return (
		<div className="min-w-0">
			<div className="relative min-w-0 overflow-hidden rounded-panel border border-ink-700 bg-ink-900">
				<svg
					viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
					role="img"
					aria-label={ariaLabel}
					className="block h-auto w-full max-w-full"
				>
					<title>{ariaLabel}</title>
					<defs>
						<pattern id="fleet-map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
							<path d="M40 0H0V40" fill="none" className="stroke-ink-700" strokeWidth="1" />
						</pattern>
					</defs>
					<rect width={WIDTH} height={HEIGHT} className="fill-ink-900" />
					<rect width={WIDTH} height={HEIGHT} fill="url(#fleet-map-grid)" />
					<path
						d="M-10 250 L180 196 L372 224 L650 128"
						fill="none"
						className="stroke-ink-700"
						strokeWidth="2"
						strokeDasharray="6 8"
					/>
					<path
						d="M118 -10 L166 132 L142 254 L214 370"
						fill="none"
						className="stroke-ink-700"
						strokeWidth="2"
						strokeDasharray="6 8"
					/>
					{points.map((point) => (
						<g key={point.id}>
							<title>{`${point.plateNo}. ${point.stateLabel}. ${point.detail}`}</title>
							{point.state === "incident" ? (
								<circle cx={point.x} cy={point.y} r={14} className="fill-alarm-500" opacity={0.2} />
							) : null}
							<circle
								cx={point.x}
								cy={point.y}
								r={8}
								strokeWidth={point.state === "offline" || point.state === "stale" ? 2 : 1}
								className={markerCore[point.state]}
							/>
						</g>
					))}
				</svg>

				<div className="pointer-events-none absolute inset-0 hidden sm:block">
					{points.map((point) => {
						const shift =
							point.x < EDGE_LABEL
								? ""
								: point.x > WIDTH - EDGE_LABEL
									? "-translate-x-full"
									: "-translate-x-1/2";
						return (
							<Link
								key={`label-${point.id}`}
								href={point.href}
								title={`${point.stateLabel} · ${point.detail}`}
								className={`pointer-events-auto absolute translate-y-2 whitespace-nowrap rounded-control bg-ink-950/80 px-1 text-meta font-medium text-fog-100 transition-colors hover:text-signal-300 ${shift}`}
								style={{
									left: `${(point.x / WIDTH) * 100}%`,
									top: `${(point.y / HEIGHT) * 100}%`,
								}}
							>
								{point.plateNo}
							</Link>
						);
					})}
				</div>
			</div>

			<ul className="mt-3 grid gap-1 sm:sr-only">
				{markers.map((marker) => (
					<li key={`state-${marker.id}`}>
						<Link
							href={marker.href}
							title={`${marker.stateLabel} · ${marker.detail}`}
							className="flex items-center justify-between gap-2 rounded-control border border-ink-700 bg-ink-900/40 px-2 py-1.5 text-meta transition-colors hover:border-ink-600 hover:bg-ink-700/40"
						>
							<span className="truncate font-medium text-fog-100">{marker.plateNo}</span>
							<span className="shrink-0 text-fog-500">{marker.stateLabel}</span>
							<span className="sr-only">{marker.detail}</span>
						</Link>
					</li>
				))}
			</ul>

			<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-ink-700 pt-3">
				{legend.map((item) => (
					<span
						key={item.state}
						className="inline-flex items-center gap-1.5 text-meta text-fog-500"
					>
						<span aria-hidden="true" className={`size-2 rounded-full ${legendDot[item.state]}`} />
						{item.label}
					</span>
				))}
			</div>
		</div>
	);
}
