import { batteryBand } from "@/lib/device/status";

export function BatteryLevel({ voltage }: { voltage: number | null }) {
	if (voltage == null) return <span className="text-fog-500">—</span>;

	const band = batteryBand(voltage);
	const percent = Math.min(100, Math.max(0, ((voltage - 10.5) / (13.2 - 10.5)) * 100));

	return (
		<span className="flex items-center gap-2">
			<span className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-700" aria-hidden="true">
				<span
					className={
						band === "critical"
							? "block h-full bg-alarm-500"
							: band === "low"
								? "block h-full bg-caution-400"
								: "block h-full bg-clear-400"
					}
					style={{ width: `${percent}%` }}
				/>
			</span>
			<span className="font-mono text-meta tabular-nums text-fog-300">{voltage.toFixed(1)} V</span>
		</span>
	);
}
