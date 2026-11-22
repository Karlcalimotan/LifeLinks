import type { MarkerState } from "@/lib/map/fleet";
import { cn } from "@/lib/utils";

/**
 * One glyph per marker state. Shape and border carry the state too, so the map
 * never relies on colour alone: offline and never-seen are hollow, low battery
 * is a ring, and an incident is a diamond.
 */
const glyphClasses: Record<MarkerState, string> = {
	online: "border-clear-400 bg-clear-400",
	weak: "border-caution-400 bg-caution-400",
	"low-battery": "border-caution-400 bg-ink-950",
	offline: "border-alarm-400 bg-ink-950",
	"never-seen": "border-dashed border-fog-500 bg-ink-950",
	incident: "rotate-45 rounded-control border-alarm-300 bg-alarm-500",
};

const toneByState: Record<MarkerState, "success" | "warning" | "danger" | "muted"> = {
	online: "success",
	weak: "warning",
	"low-battery": "warning",
	offline: "danger",
	"never-seen": "muted",
	incident: "danger",
};

export function markerBadgeTone(state: MarkerState): "success" | "warning" | "danger" | "muted" {
	return toneByState[state];
}

export function MarkerGlyph({
	state,
	stale = false,
	selected = false,
	className,
}: {
	state: MarkerState;
	stale?: boolean;
	selected?: boolean;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"relative inline-flex size-3.5 shrink-0 items-center justify-center",
				selected && "rounded-full ring-2 ring-fog-100 ring-offset-2 ring-offset-ink-950",
				className,
			)}
		>
			<span
				className={cn(
					"absolute inset-0 rounded-full border-2",
					glyphClasses[state],
					stale && "border-dashed",
				)}
			/>
			{state === "low-battery" ? (
				<span className="relative size-1 rounded-full bg-caution-400" />
			) : null}
		</span>
	);
}
