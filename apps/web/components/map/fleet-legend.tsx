import { MARKER_STATES, type MarkerState } from "@/lib/map/fleet";
import { MarkerGlyph } from "./marker-glyph";

export interface FleetLegendLabels {
	title: string;
	states: Record<MarkerState, string>;
	stale: string;
}

export function FleetLegend({ labels }: { labels: FleetLegendLabels }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-700 px-4 py-3">
			<span className="text-meta font-medium text-fog-500">{labels.title}</span>
			{MARKER_STATES.map((state) => (
				<span key={state} className="inline-flex items-center gap-1.5 text-meta text-fog-300">
					<MarkerGlyph state={state} />
					{labels.states[state]}
				</span>
			))}
			<span className="inline-flex items-center gap-1.5 text-meta text-fog-500">
				<MarkerGlyph state="online" stale />
				{labels.stale}
			</span>
		</div>
	);
}
