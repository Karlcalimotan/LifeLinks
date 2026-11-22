import { isValidCoordinate } from "@/lib/geo";
import { clamp } from "@/lib/utils";

/**
 * Schematic projection for the fleet map. It turns WGS84 points into viewBox
 * coordinates; there are no tiles and no external map dependency. Latitude is
 * inverted because SVG y grows downwards.
 */

export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 460;
export const MAP_PADDING = 56;

/** A single point still needs a viewport; this is roughly 440 m at the equator. */
export const MIN_BOUNDS_SPAN_DEG = 0.004;

export const LABEL_GAP = 14;
/** Labels flip to the left when the marker is within this distance of the edge. */
export const LABEL_GUTTER = 168;

export interface GeoPoint {
	lat: number;
	lng: number;
}

export interface Bounds {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
}

export interface MapFrame {
	width: number;
	height: number;
	padding: number;
}

export const DEFAULT_MAP_FRAME: MapFrame = {
	width: MAP_WIDTH,
	height: MAP_HEIGHT,
	padding: MAP_PADDING,
};

export interface PlacedPoint {
	x: number;
	y: number;
	labelX: number;
	labelY: number;
	labelAnchor: "start" | "end";
}

function isMappable(point: GeoPoint): boolean {
	return isValidCoordinate(point.lat, point.lng);
}

function expandAxis(min: number, max: number, minSpan: number): [number, number] {
	const span = max - min;
	if (span >= minSpan) return [min, max];
	const center = (min + max) / 2;
	return [center - minSpan / 2, center + minSpan / 2];
}

/** Keep a degenerate axis (one point, or points on one line) from dividing by zero. */
export function ensureMinSpan(bounds: Bounds, minSpan = MIN_BOUNDS_SPAN_DEG): Bounds {
	const [minLat, maxLat] = expandAxis(bounds.minLat, bounds.maxLat, minSpan);
	const [minLng, maxLng] = expandAxis(bounds.minLng, bounds.maxLng, minSpan);
	return {
		minLat: clamp(minLat, -90, 90),
		maxLat: clamp(maxLat, -90, 90),
		minLng: clamp(minLng, -180, 180),
		maxLng: clamp(maxLng, -180, 180),
	};
}

/** Bounds of every valid point, or null when nothing can be mapped. */
export function boundsFor(points: readonly (GeoPoint | null | undefined)[]): Bounds | null {
	let minLat = Number.POSITIVE_INFINITY;
	let maxLat = Number.NEGATIVE_INFINITY;
	let minLng = Number.POSITIVE_INFINITY;
	let maxLng = Number.NEGATIVE_INFINITY;
	let count = 0;

	for (const point of points) {
		if (!point || !isMappable(point)) continue;
		minLat = Math.min(minLat, point.lat);
		maxLat = Math.max(maxLat, point.lat);
		minLng = Math.min(minLng, point.lng);
		maxLng = Math.max(maxLng, point.lng);
		count += 1;
	}

	if (count === 0) return null;
	return ensureMinSpan({ minLat, maxLat, minLng, maxLng });
}

/** Place a point inside the padded frame. Points outside the bounds are clamped. */
export function projectPoint(
	point: GeoPoint,
	bounds: Bounds,
	frame: MapFrame = DEFAULT_MAP_FRAME,
): { x: number; y: number } {
	const innerWidth = frame.width - frame.padding * 2;
	const innerHeight = frame.height - frame.padding * 2;
	const spanLng = bounds.maxLng - bounds.minLng || 1;
	const spanLat = bounds.maxLat - bounds.minLat || 1;
	const x = frame.padding + ((point.lng - bounds.minLng) / spanLng) * innerWidth;
	const y = frame.padding + ((bounds.maxLat - point.lat) / spanLat) * innerHeight;
	return {
		x: clamp(x, frame.padding, frame.width - frame.padding),
		y: clamp(y, frame.padding, frame.height - frame.padding),
	};
}

/**
 * Labels sit to the right of a marker unless that would run past the frame
 * edge; then they are anchored on the left so the plate stays inside the map.
 */
export function placeLabel(
	position: { x: number; y: number },
	frame: MapFrame = DEFAULT_MAP_FRAME,
): Pick<PlacedPoint, "labelX" | "labelY" | "labelAnchor"> {
	const labelAnchor = position.x > frame.width - LABEL_GUTTER ? "end" : "start";
	return {
		labelX: position.x + (labelAnchor === "start" ? LABEL_GAP : -LABEL_GAP),
		labelY: position.y,
		labelAnchor,
	};
}

export interface ProjectedPoints<T> {
	bounds: Bounds;
	points: (T & PlacedPoint)[];
}

/**
 * Project a list of identified points and drop anything that is not a valid
 * coordinate. Returns null when no point can be mapped.
 */
export function projectPoints<T extends GeoPoint & { id: string }>(
	points: readonly T[],
	frame: MapFrame = DEFAULT_MAP_FRAME,
): ProjectedPoints<T> | null {
	const mappable = points.filter(isMappable);
	const bounds = boundsFor(mappable);
	if (!bounds) return null;

	return {
		bounds,
		points: mappable.map((point) => {
			const position = projectPoint(point, bounds, frame);
			return { ...point, ...position, ...placeLabel(position, frame) };
		}),
	};
}

function hemisphere(lat: number, lng: number): { lat: string; lng: string } {
	return {
		lat: lat < 0 ? "S" : "N",
		lng: lng < 0 ? "W" : "E",
	};
}

/** Compact degree extent printed under the map, e.g. "10.6812–10.7245 N · 122.5410–122.6032 E". */
export function formatBounds(bounds: Bounds): string {
	const center = {
		lat: (bounds.minLat + bounds.maxLat) / 2,
		lng: (bounds.minLng + bounds.maxLng) / 2,
	};
	const { lat, lng } = hemisphere(center.lat, center.lng);
	return `${Math.abs(bounds.minLat).toFixed(4)}–${Math.abs(bounds.maxLat).toFixed(4)} ${lat} · ${Math.abs(bounds.minLng).toFixed(4)}–${Math.abs(bounds.maxLng).toFixed(4)} ${lng}`;
}
