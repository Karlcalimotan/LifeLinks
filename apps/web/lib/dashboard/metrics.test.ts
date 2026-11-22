import { describe, expect, it } from "vitest";
import { fleetMapBounds, fleetMarkerState, projectToMap } from "./metrics";

describe("fleetMapBounds", () => {
	it("wraps the outermost fixes", () => {
		const bounds = fleetMapBounds([
			{ lat: 10.7, lng: 122.5 },
			{ lat: 10.9, lng: 122.7 },
			{ lat: 10.8, lng: 122.6 },
		]);

		expect(bounds).toEqual({
			minLat: 10.7,
			maxLat: 10.9,
			minLng: 122.5,
			maxLng: 122.7,
		});
	});

	it("expands a single fix to a readable span", () => {
		const bounds = fleetMapBounds([{ lat: 10.7202, lng: 122.5621 }], 0.01);

		expect(bounds.maxLat - bounds.minLat).toBeCloseTo(0.01);
		expect(bounds.maxLng - bounds.minLng).toBeCloseTo(0.01);
		expect((bounds.minLat + bounds.maxLat) / 2).toBeCloseTo(10.7202);
	});

	it("keeps a degenerate axis at the minimum span", () => {
		const bounds = fleetMapBounds(
			[
				{ lat: 10.7, lng: 122.5 },
				{ lat: 10.9, lng: 122.5 },
			],
			0.02,
		);

		expect(bounds.maxLng - bounds.minLng).toBeCloseTo(0.02);
		expect(bounds.maxLat - bounds.minLat).toBeCloseTo(0.2);
	});
});

describe("projectToMap", () => {
	const bounds = { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
	const size = { width: 100, height: 100 };

	it("puts north at the top and west at the left", () => {
		expect(projectToMap({ lat: 0, lng: 0 }, bounds, size, 10)).toEqual({ x: 10, y: 90 });
		expect(projectToMap({ lat: 1, lng: 1 }, bounds, size, 10)).toEqual({ x: 90, y: 10 });
	});

	it("centres the middle of the bounds", () => {
		expect(projectToMap({ lat: 0.5, lng: 0.5 }, bounds, size, 10)).toEqual({
			x: 50,
			y: 50,
		});
	});

	it("centres a single point in a square box", () => {
		const single = fleetMapBounds([{ lat: 10.7202, lng: 122.5621 }]);
		const point = projectToMap({ lat: 10.7202, lng: 122.5621 }, single, size, 10);

		expect(point.x).toBeCloseTo(50);
		expect(point.y).toBeCloseTo(50);
	});

	it("clamps padding that would consume the box", () => {
		const point = projectToMap({ lat: 0.5, lng: 0.5 }, bounds, size, 80);
		expect(point.x).toBeGreaterThanOrEqual(0);
		expect(point.x).toBeLessThanOrEqual(100);
	});
});

describe("fleetMarkerState", () => {
	it("puts an open incident ahead of device health", () => {
		expect(fleetMarkerState({ connection: "offline", hasOpenIncident: true, staleFix: true })).toBe(
			"incident",
		);
	});

	it("distinguishes offline, stale, weak and online", () => {
		expect(
			fleetMarkerState({ connection: "offline", hasOpenIncident: false, staleFix: true }),
		).toBe("offline");
		expect(fleetMarkerState({ connection: "online", hasOpenIncident: false, staleFix: true })).toBe(
			"stale",
		);
		expect(fleetMarkerState({ connection: "weak", hasOpenIncident: false, staleFix: false })).toBe(
			"weak",
		);
		expect(
			fleetMarkerState({ connection: "online", hasOpenIncident: false, staleFix: false }),
		).toBe("online");
	});

	it("treats a never-seen device as stale, not online", () => {
		expect(
			fleetMarkerState({ connection: "unknown", hasOpenIncident: false, staleFix: false }),
		).toBe("stale");
	});
});
