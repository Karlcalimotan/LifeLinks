export interface Coordinate {
	lat: number;
	lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function isValidCoordinate(lat: number, lng: number): boolean {
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		lat >= -90 &&
		lat <= 90 &&
		lng >= -180 &&
		lng <= 180 &&
		!(lat === 0 && lng === 0)
	);
}

/** Great-circle distance in metres. */
export function haversineMeters(a: Coordinate, b: Coordinate): number {
	const toRad = (degrees: number) => (degrees * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideGeofence(point: Coordinate, center: Coordinate, radiusM: number): boolean {
	return haversineMeters(point, center) <= radiusM;
}

export function mapLink(lat: number, lng: number): string {
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
