import type { DeviceConnectionState } from "@/lib/device/status";

/** Pure schematic-map calculations. Day buckets and durations live in analytics. */

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
