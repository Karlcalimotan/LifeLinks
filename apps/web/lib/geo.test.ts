import { describe, expect, it } from "vitest";
import { haversineMeters, isInsideGeofence, isValidCoordinate, mapLink } from "./geo";

describe("geo helpers", () => {
	const cebu = { lat: 10.3157, lng: 123.8854 };
	const manila = { lat: 14.5995, lng: 120.9842 };

	it("measures a known city pair", () => {
		const distanceKm = haversineMeters(cebu, manila) / 1000;
		expect(distanceKm).toBeGreaterThan(550);
		expect(distanceKm).toBeLessThan(600);
	});

	it("rejects impossible coordinates and the null island", () => {
		expect(isValidCoordinate(10.3, 123.9)).toBe(true);
		expect(isValidCoordinate(0, 0)).toBe(false);
		expect(isValidCoordinate(91, 123)).toBe(false);
		expect(isValidCoordinate(10, 181)).toBe(false);
	});

	it("checks a geofence", () => {
		expect(isInsideGeofence(cebu, cebu, 100)).toBe(true);
		expect(isInsideGeofence(manila, cebu, 1000)).toBe(false);
	});

	it("builds an OpenStreetMap link", () => {
		expect(mapLink(10.3157, 123.8854)).toContain("mlat=10.3157");
	});
});
