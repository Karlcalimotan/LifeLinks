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
			<div className="grid h-48 place-items-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
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
					<CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
					<XAxis
						dataKey="label"
						tick={{ fill: "#64748b", fontSize: 10 }}
						interval="preserveStartEnd"
					/>
					<YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
					<Tooltip
						contentStyle={{
							background: "#0b1220",
							border: "1px solid #1e293b",
							borderRadius: 8,
							fontSize: 12,
						}}
					/>
					<Legend wrapperStyle={{ fontSize: 11 }} />
					<Line
						type="monotone"
						dataKey="accelG"
						name="Acceleration (g)"
						stroke="#22d3ee"
						strokeWidth={2}
						dot={false}
					/>
					<Line
						type="monotone"
						dataKey="tiltDeg"
						name="Tilt (deg)"
						stroke="#f59e0b"
						strokeWidth={2}
						dot={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
