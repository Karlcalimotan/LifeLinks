import { Link } from "@/i18n/routing";
import type { MarkerState } from "@/lib/map/fleet";
import { DEFAULT_MAP_FRAME, formatBounds, projectPoints } from "@/lib/map/projection";
import { TriangleAlert } from "lucide-react";
import { MarkerGlyph } from "./marker-glyph";

export interface SchematicMapMarker {
	id: string;
	plate: string;
	lat: number;
	lng: number;
	state: MarkerState;
	stale: boolean;
	selected: boolean;
	href: string;
}

const GRID_COLUMNS = [25, 50, 75];
const GRID_ROWS = [33.333, 66.666];
const FRAME = DEFAULT_MAP_FRAME;

function percentX(x: number): string {
	return `${(x / FRAME.width) * 100}%`;
}

function percentY(y: number): string {
	return `${(y / FRAME.height) * 100}%`;
}

/**
 * A dependency-free schematic map: an SVG grid and HTML markers placed by the
 * pure projection. Marker sizes stay readable at 390 px because they are not
 * scaled with the viewBox.
 */
export function SchematicMap({
	markers,
	stateLabels,
	staleLabel,
	mapLabel,
	schematicNote,
}: {
	markers: readonly SchematicMapMarker[];
	stateLabels: Record<MarkerState, string>;
	staleLabel: string;
	mapLabel: string;
	schematicNote: string;
}) {
	const projected = projectPoints(markers, FRAME);
	if (!projected) return null;

	return (
		<div>
			<section
				aria-label={mapLabel}
				className="console-grid relative aspect-[4/3] w-full overflow-hidden bg-ink-950"
			>
				<svg
					aria-hidden="true"
					className="absolute inset-0 size-full"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
				>
					<rect
						x="0.5"
						y="0.5"
						width="99"
						height="99"
						fill="none"
						className="stroke-ink-600"
						strokeWidth="1"
						vectorEffect="non-scaling-stroke"
					/>
					{GRID_COLUMNS.map((x) => (
						<line
							key={`column-${x}`}
							x1={x}
							y1={0}
							x2={x}
							y2={100}
							className="stroke-fog-500/20"
							strokeWidth="1"
							vectorEffect="non-scaling-stroke"
						/>
					))}
					{GRID_ROWS.map((y) => (
						<line
							key={`row-${y}`}
							x1={0}
							y1={y}
							x2={100}
							y2={y}
							className="stroke-fog-500/20"
							strokeWidth="1"
							vectorEffect="non-scaling-stroke"
						/>
					))}
				</svg>

				{projected.points.map((point) => {
					const name = point.stale
						? `${point.plate}: ${stateLabels[point.state]}, ${staleLabel}`
						: `${point.plate}: ${stateLabels[point.state]}`;

					return (
						<Link
							key={point.id}
							href={point.href}
							tabIndex={-1}
							aria-label={name}
							aria-current={point.selected ? "true" : undefined}
							title={name}
							style={{ left: percentX(point.x), top: percentY(point.y) }}
							className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full p-3 sm:p-2"
						>
							<span className="relative inline-flex">
								{point.state === "incident" ? (
									<span
										aria-hidden="true"
										className="beacon-pulse absolute -inset-1.5 rounded-full border border-alarm-300/70"
									/>
								) : null}
								<MarkerGlyph
									state={point.state}
									stale={point.stale}
									selected={point.selected}
									className="size-4"
								/>
							</span>
							<span
								className={[
									"pointer-events-none absolute top-1/2 inline-flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-control border border-ink-700 bg-ink-950/90 px-1 text-meta font-medium text-fog-100",
									point.labelAnchor === "start" ? "left-full ml-2" : "right-full mr-2",
									point.selected ? "inline-flex" : "hidden sm:inline-flex",
								].join(" ")}
							>
								{point.state === "incident" ? (
									<TriangleAlert className="size-3 text-alarm-300" aria-hidden="true" />
								) : null}
								{point.plate}
							</span>
						</Link>
					);
				})}
			</section>

			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-ink-700 px-4 py-2.5 text-meta text-fog-500">
				<span className="font-mono tabular-nums">{formatBounds(projected.bounds)}</span>
				<span>{schematicNote}</span>
			</div>
		</div>
	);
}
