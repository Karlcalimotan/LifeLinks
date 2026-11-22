import { describe, expect, it } from "vitest";
import {
	averageAcknowledgementMs,
	bucketByManilaDay,
	fleetMapBounds,
	fleetMarkerState,
	formatDuration,
	lastManilaDays,
	projectToMap,
} from "./metrics";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

describe("formatDuration", () => {
	it("renders seconds, minutes, hours and days", () => {
		expect(formatDuration(0)).toBe("0s");
		expect(formatDuration(42_000)).toBe("42s");
		expect(formatDuration(724_000)).toBe("12m 04s");
		expect(formatDuration(12_000_000)).toBe("3h 20m");
		expect(formatDuration(194_400_000)).toBe("2d 6h");
	});

	it("returns an em dash when there is no sample", () => {
		expect(formatDuration(null)).toBe("—");
		expect(formatDuration(Number.NaN)).toBe("—");
	});

	it("clamps negative durations", () => {
		expect(formatDuration(-5_000)).toBe("0s");
	});
});

describe("lastManilaDays", () => {
	it("returns 14 Manila day starts ending with today, oldest first", () => {
		// 23:30 on 22 Nov in Manila.
		const now = new Date("2026-11-22T15:30:00.000Z");
		const days = lastManilaDays(now);

		expect(days).toHaveLength(14);
		expect(days.at(-1)?.toISOString()).toBe("2026-11-21T16:00:00.000Z");
		expect(days.at(0)?.toISOString()).toBe("2026-11-08T16:00:00.000Z");
		expect((days.at(-1)?.getTime() ?? 0) - (days.at(0)?.getTime() ?? 0)).toBe(13 * DAY_MS);
	});

	it("keeps a timestamp just after Manila midnight in the new day", () => {
		const now = new Date("2026-11-22T16:30:00.000Z");
		const days = lastManilaDays(now);

		expect(days.at(-1)?.toISOString()).toBe("2026-11-22T16:00:00.000Z");
	});
});

describe("bucketByManilaDay", () => {
	const now = new Date("2026-11-22T15:30:00.000Z");
	const days = lastManilaDays(now);

	it("buckets by the Manila calendar day, not UTC", () => {
		const buckets = bucketByManilaDay(
			[
				new Date("2026-11-21T16:30:00.000Z"), // 22 Nov, 00:30 Manila
				new Date("2026-11-21T15:30:00.000Z"), // 21 Nov, 23:30 Manila
				new Date("2026-11-21T15:30:00.000Z"),
			],
			days,
		);

		expect(buckets.at(-1)).toEqual({
			start: new Date("2026-11-21T16:00:00.000Z"),
			count: 1,
		});
		expect(buckets.at(-2)).toEqual({
			start: new Date("2026-11-20T16:00:00.000Z"),
			count: 2,
		});
		expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
	});

	it("ignores timestamps outside the window and invalid dates", () => {
		const buckets = bucketByManilaDay(
			[
				new Date("2026-11-01T00:00:00.000Z"),
				new Date("2026-11-24T00:00:00.000Z"),
				new Date("not a date"),
			],
			days,
		);

		expect(buckets.every((bucket) => bucket.count === 0)).toBe(true);
	});

	it("returns an entry for every empty day", () => {
		const buckets = bucketByManilaDay([], days);
		expect(buckets).toHaveLength(14);
		expect(buckets.map((bucket) => bucket.count)).toEqual(new Array(14).fill(0));
	});
});

describe("averageAcknowledgementMs", () => {
	it("returns null when no incident was acknowledged", () => {
		expect(averageAcknowledgementMs([])).toBeNull();
	});

	it("averages sparse samples", () => {
		const detectedAt = new Date("2026-11-22T08:00:00.000Z");
		const average = averageAcknowledgementMs([
			{ detectedAt, acknowledgedAt: new Date(detectedAt.getTime() + 2 * 60_000) },
			{ detectedAt, acknowledgedAt: new Date(detectedAt.getTime() + 4 * 60_000) },
			{ detectedAt, acknowledgedAt: new Date(detectedAt.getTime() + 12 * 60_000) },
		]);

		expect(average).toBe(6 * 60_000);
	});

	it("discards acknowledgements that predate detection", () => {
		const detectedAt = new Date("2026-11-22T08:00:00.000Z");
		const average = averageAcknowledgementMs([
			{ detectedAt, acknowledgedAt: new Date(detectedAt.getTime() - HOUR_MS) },
			{ detectedAt, acknowledgedAt: new Date(detectedAt.getTime() + 60_000) },
		]);

		expect(average).toBe(60_000);
	});
});

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
