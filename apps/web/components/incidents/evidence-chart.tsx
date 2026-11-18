"use client";

import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export interface EvidencePoint {
	t: number;
	accelG?: number;
	tiltDeg?: number;
}

export function EvidenceChart({ points }: { points: EvidencePoint[] }) {
	if (points.length === 0) {
		return (
			<div className="grid h-48 place-items-center rounded border border-dashed border-ink-700 text-xs text-fog-500">
				No waveform samples were attached to this incident.
			</div>
		);
	}

	const data = points.map((point) => ({
		...point,
		label: new Date(point.t * 1000).toLocaleTimeString("en-PH", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZone: "Asia/Manila",
		}),
	}));

	return (
		<div className="h-56 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
					<CartesianGrid stroke="#1a3a42" strokeDasharray="3 3" />
					<XAxis
						dataKey="label"
						tick={{ fill: "#8fa3a6", fontSize: 10 }}
						interval="preserveStartEnd"
					/>
					<YAxis tick={{ fill: "#8fa3a6", fontSize: 10 }} />
					<Tooltip
						contentStyle={{
							background: "#0d1c21",
							border: "1px solid #1a3a42",
							borderRadius: 4,
							color: "#e8f1f2",
							fontSize: 12,
						}}
					/>
					<Legend wrapperStyle={{ fontSize: 11, color: "#8fa3a6" }} />
					<Line
						type="monotone"
						dataKey="accelG"
						name="Acceleration (g)"
						stroke="#45b8e8"
						strokeWidth={2}
						dot={false}
						isAnimationActive={false}
					/>
					<Line
						type="monotone"
						dataKey="tiltDeg"
						name="Tilt (deg)"
						stroke="#ffb020"
						strokeWidth={2}
						dot={false}
						isAnimationActive={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
