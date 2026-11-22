import type { DeviceConnectionState } from "@/lib/device/status";
import { manilaDayStart } from "@/lib/time";

/**
 * Pure dashboard calculations. No Prisma, no React, no clock beyond the `now`
 * the caller passes in, so every rule here can be tested directly.
 */

export const DASHBOARD_TREND_DAYS = 14;
export const ACKNOWLEDGEMENT_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

export type FleetMarkerState = "incident" | "online" | "weak" | "offline" | "stale";

export interface MapPoint {
	lat: number;
	lng: number;
}

export interface MapBounds {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
}

export interface MapSize {
	width: number;
	height: number;
}

export interface ProjectedPoint {
	x: number;
	y: number;
}

export interface AcknowledgementSample {
	detectedAt: Date;
	acknowledgedAt: Date;
}

/**
 * Compact duration for elapsed timers and KPI values: `42s`, `12m 04s`,
 * `3h 20m`, `2d 6h`. A missing sample is an em dash, never a guess.
 */
export function formatDuration(ms: number | null): string {
	if (ms == null || !Number.isFinite(ms)) return "—";
	const total = Math.max(0, Math.round(ms / 1000));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}

/** Manila calendar day starts, oldest first, ending with the day containing `now`. */
export function lastManilaDays(now = new Date(), days = DASHBOARD_TREND_DAYS): Date[] {
	const today = manilaDayStart(now);
	const out: Date[] = [];
	for (let offset = days - 1; offset >= 0; offset -= 1) {
		out.push(new Date(today.getTime() - offset * DAY_MS));
	}
	return out;
}

export interface TrendBucket {
	start: Date;
	count: number;
}

/**
 * Count timestamps into the supplied Manila day starts. Timestamps outside the
 * window are ignored rather than folded into the nearest day.
 */
export function bucketByManilaDay(dates: readonly Date[], days: readonly Date[]): TrendBucket[] {
	const index = new Map<number, number>();
	days.forEach((day, position) => index.set(day.getTime(), position));
	const counts = new Array<number>(days.length).fill(0);

	for (const date of dates) {
		if (Number.isNaN(date.getTime())) continue;
		const position = index.get(manilaDayStart(date).getTime());
		if (position == null) continue;
		counts[position] = (counts[position] ?? 0) + 1;
	}

	return days.map((start, position) => ({ start, count: counts[position] ?? 0 }));
}

/**
 * Mean time from detection to the first acknowledgement. Samples where the
 * acknowledgement predates detection are discarded. No samples means null, so
 * the caller shows an em dash instead of a fabricated zero.
 */
export function averageAcknowledgementMs(samples: readonly AcknowledgementSample[]): number | null {
	const durations: number[] = [];
	for (const sample of samples) {
		const duration = sample.acknowledgedAt.getTime() - sample.detectedAt.getTime();
		if (!Number.isFinite(duration) || duration < 0) continue;
		durations.push(duration);
	}
	if (durations.length === 0) return null;
	const total = durations.reduce((sum, duration) => sum + duration, 0);
	return Math.round(total / durations.length);
}

/**
 * Bounding box for the schematic map. A single fix, or a tight cluster, is
 * expanded to `minSpanDeg` around its centre so markers do not sit on the edge.
 */
export function fleetMapBounds(points: readonly MapPoint[], minSpanDeg = 0.01): MapBounds {
	if (points.length === 0) {
		return {
			minLat: -minSpanDeg / 2,
			maxLat: minSpanDeg / 2,
			minLng: -minSpanDeg / 2,
			maxLng: minSpanDeg / 2,
		};
	}

	let minLat = Number.POSITIVE_INFINITY;
	let maxLat = Number.NEGATIVE_INFINITY;
	let minLng = Number.POSITIVE_INFINITY;
	let maxLng = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		minLat = Math.min(minLat, point.lat);
		maxLat = Math.max(maxLat, point.lat);
		minLng = Math.min(minLng, point.lng);
		maxLng = Math.max(maxLng, point.lng);
	}

	const latSpan = maxLat - minLat;
	const lngSpan = maxLng - minLng;
	const latCentre = (minLat + maxLat) / 2;
	const lngCentre = (minLng + maxLng) / 2;

	return {
		minLat: latSpan < minSpanDeg ? latCentre - minSpanDeg / 2 : minLat,
		maxLat: latSpan < minSpanDeg ? latCentre + minSpanDeg / 2 : maxLat,
		minLng: lngSpan < minSpanDeg ? lngCentre - minSpanDeg / 2 : minLng,
		maxLng: lngSpan < minSpanDeg ? lngCentre + minSpanDeg / 2 : maxLng,
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Project a coordinate into an SVG box, north up, with a fixed pixel inset. */
export function projectToMap(
	point: MapPoint,
	bounds: MapBounds,
	size: MapSize,
	padding: number,
): ProjectedPoint {
	const pad = Math.max(0, Math.min(padding, Math.min(size.width, size.height) / 2));
	const usableWidth = Math.max(1, size.width - pad * 2);
	const usableHeight = Math.max(1, size.height - pad * 2);
	const lngSpan = bounds.maxLng - bounds.minLng || 1;
	const latSpan = bounds.maxLat - bounds.minLat || 1;

	const x = pad + ((point.lng - bounds.minLng) / lngSpan) * usableWidth;
	const y = pad + ((bounds.maxLat - point.lat) / latSpan) * usableHeight;

	return {
		x: clamp(x, pad, pad + usableWidth),
		y: clamp(y, pad, pad + usableHeight),
	};
}

/**
 * Marker state priority: an open incident outranks device health, then the
 * connection state, and finally a fix too old to call live. A never-seen
 * device with coordinates is treated as stale rather than online.
 */
export function fleetMarkerState(input: {
	connection: DeviceConnectionState;
	hasOpenIncident: boolean;
	staleFix: boolean;
}): FleetMarkerState {
	if (input.hasOpenIncident) return "incident";
	if (input.connection === "offline") return "offline";
	if (input.staleFix) return "stale";
	if (input.connection === "weak") return "weak";
	if (input.connection === "online") return "online";
	return "stale";
}
