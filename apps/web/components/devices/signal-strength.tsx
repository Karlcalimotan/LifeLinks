import type { DeviceConnectionState, SignalBand } from "@/lib/device/status";
import { signalBand, signalBarCount } from "@/lib/device/status";

const barHeights = ["h-1", "h-2", "h-3", "h-4"] as const;

const bandTones: Record<Exclude<SignalBand, "unknown">, string> = {
	strong: "bg-clear-400",
	good: "bg-clear-400",
	fair: "bg-caution-400",
	poor: "bg-alarm-400",
};

export interface SignalLabels {
	strong: string;
	good: string;
	fair: string;
	poor: string;
	noSignal: string;
	noReading: string;
}

/**
 * Bars plus the raw dBm value. Bars are decorative; the number and the hidden
 * band label carry the meaning. A stale reading is not shown for offline or
 * never-seen trackers.
 */
export function SignalStrength({
	rssiDbm,
	state,
	labels,
}: {
	rssiDbm: number | null;
	state: DeviceConnectionState;
	labels: SignalLabels;
}) {
	if (state === "offline" || state === "unknown") {
		return <span className="text-meta text-fog-500">{labels.noSignal}</span>;
	}
	const band = signalBand(rssiDbm);
	if (band === "unknown" || rssiDbm == null) {
		return <span className="text-meta text-fog-500">{labels.noReading}</span>;
	}

	const filled = signalBarCount(band);
	const tone = bandTones[band];
	const label = labels[band];

	return (
		<span className="inline-flex items-center gap-2" title={`${rssiDbm} dBm, ${label}`}>
			<span className="flex h-4 items-end gap-0.5" aria-hidden="true">
				{barHeights.map((height, index) => (
					<span key={height} className={`w-1 ${height} ${index < filled ? tone : "bg-ink-600"}`} />
				))}
			</span>
			<span className="font-mono text-meta tabular-nums text-fog-300">{rssiDbm} dBm</span>
			<span className="sr-only">{label}</span>
		</span>
	);
}
