import { describe, expect, it } from "vitest";
import {
	type AcknowledgementSample,
	type AnalyticsIncident,
	acknowledgementSamples,
	analyticsWindow,
	averageDuration,
	countByHour,
	countByManilaDay,
	falseAlarmRate,
	formatDuration,
	manilaDayKey,
	manilaHour,
	parseAnalyticsRange,
	resolutionDurations,
	severityDistribution,
	slowestResponses,
	summarizeIncidents,
	topVehicles,
} from "./aggregate";

const NOW = new Date("2026-11-22T12:00:00+08:00");
const manila = (value: string) => new Date(`${value}+08:00`);

function incident(overrides: Partial<AnalyticsIncident> = {}): AnalyticsIncident {
	return {
		id: "inc-1",
		detectedAt: manila("2026-11-22T09:00:00"),
		status: "CONFIRMED",
		resolvedAt: null,
		peakAccelG: 2.6,
		tiltDeg: 10,
		vehicleId: "veh-1",
		vehicle: { plateNo: "ABC 1234" },
		...overrides,
	};
}

function sample(overrides: Partial<AcknowledgementSample> = {}): AcknowledgementSample {
	return {
		incidentId: "inc-1",
		vehicleId: "veh-1",
		plateNo: "ABC 1234",
		detectedAt: manila("2026-11-22T09:00:00"),
		elapsedMs: 5_000,
		actorName: "R. Cruz",
		...overrides,
	};
}

describe("analytics range", () => {
	it("accepts only the offered ranges and defaults to seven days", () => {
		expect(parseAnalyticsRange("7")).toBe(7);
		expect(parseAnalyticsRange("14")).toBe(14);
		expect(parseAnalyticsRange("30")).toBe(30);
		expect(parseAnalyticsRange(["30"])).toBe(30);
		expect(parseAnalyticsRange(undefined)).toBe(7);
		expect(parseAnalyticsRange("12")).toBe(7);
		expect(parseAnalyticsRange("30days")).toBe(7);
	});

	it("builds Manila calendar days, oldest first, including today", () => {
		const window = analyticsWindow(7, NOW);

		expect(window.days).toHaveLength(7);
		expect(window.start.toISOString()).toBe("2026-11-15T16:00:00.000Z");
		expect(window.days.map(manilaDayKey)).toEqual([
			"2026-11-16",
			"2026-11-17",
			"2026-11-18",
			"2026-11-19",
			"2026-11-20",
			"2026-11-21",
			"2026-11-22",
		]);
		expect(window.end).toBe(NOW);
	});

	it("buckets on Manila midnight, not the server day or UTC", () => {
		const days = analyticsWindow(7, NOW).days;
		const counts = countByManilaDay(
			[
				{ detectedAt: manila("2026-11-16T00:00:00") },
				{ detectedAt: manila("2026-11-16T23:59:59") },
				{ detectedAt: new Date("2026-11-15T16:30:00Z") },
				{ detectedAt: manila("2026-11-17T00:00:00") },
				{ detectedAt: manila("2026-11-15T23:59:59") },
			],
			days,
		);

		expect(counts).toHaveLength(7);
		expect(counts[0]).toMatchObject({ key: "2026-11-16", count: 3 });
		expect(counts[1]).toMatchObject({ key: "2026-11-17", count: 1 });
		expect(counts.reduce((sum, day) => sum + day.count, 0)).toBe(4);
		expect(manilaDayKey(new Date("2026-11-21T16:00:00Z"))).toBe("2026-11-22");
	});
});

describe("response durations", () => {
	it("returns no average for an empty sample and averages multiple samples", () => {
		expect(averageDuration([])).toEqual({ averageMs: null, count: 0, totalMs: 0 });
		expect(averageDuration([4_000, 8_000])).toEqual({
			averageMs: 6_000,
			count: 2,
			totalMs: 12_000,
		});
	});

	it("ignores missing, non-finite and negative samples", () => {
		expect(averageDuration([null, undefined, Number.NaN, -1_000, 1_500])).toEqual({
			averageMs: 1_500,
			count: 1,
			totalMs: 1_500,
		});
	});

	it("pairs each incident with its earliest acknowledgement audit", () => {
		const incidentRow = {
			id: "inc-1",
			detectedAt: manila("2026-11-22T09:00:00"),
			vehicleId: "veh-1",
			vehicle: { plateNo: "ABC 1234" },
		};
		const samples = acknowledgementSamples(
			[
				{ target: "inc-1", createdAt: manila("2026-11-22T09:01:00"), actorName: "Later" },
				{ target: "inc-1", createdAt: manila("2026-11-22T09:00:30"), actorName: "R. Cruz" },
				{ target: "inc-1", createdAt: manila("2026-11-22T08:59:00"), actorName: "Clock skew" },
				{ target: "inc-unknown", createdAt: manila("2026-11-22T09:02:00") },
				{ target: null, createdAt: manila("2026-11-22T09:03:00") },
			],
			[incidentRow],
		);

		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			incidentId: "inc-1",
			vehicleId: "veh-1",
			plateNo: "ABC 1234",
			elapsedMs: 30_000,
			actorName: "R. Cruz",
		});
		expect(acknowledgementSamples([], [incidentRow])).toEqual([]);
	});

	it("measures resolve time from detection and skips rows without a resolution", () => {
		const durations = resolutionDurations([
			incident({
				id: "resolved",
				status: "RESOLVED",
				resolvedAt: manila("2026-11-22T10:00:00"),
			}),
			incident({ id: "active", status: "ACKNOWLEDGED" }),
			incident({ id: "missing", status: "RESOLVED", resolvedAt: null }),
			incident({
				id: "negative",
				status: "RESOLVED",
				resolvedAt: manila("2026-11-22T08:00:00"),
			}),
		]);

		expect(durations).toEqual([3_600_000]);
	});

	it("formats compact durations and an empty value", () => {
		expect(formatDuration(null)).toBe("—");
		expect(formatDuration(undefined)).toBe("—");
		expect(formatDuration(0)).toBe("0s");
		expect(formatDuration(4_000)).toBe("4s");
		expect(formatDuration(65_000)).toBe("1m 5s");
		expect(formatDuration(3_725_000)).toBe("1h 2m");
		expect(formatDuration(194_400_000)).toBe("2d 6h");
		expect(formatDuration(50 * 3_600_000)).toBe("2d 2h");
		expect(formatDuration(48 * 3_600_000)).toBe("2d 0h");
		expect(formatDuration(-5_000)).toBe("0s");
	});
});

describe("false alarm rate", () => {
	it("has no rate when nothing is included", () => {
		expect(falseAlarmRate([])).toEqual({ numerator: 0, denominator: 0, rate: null });
		expect(falseAlarmRate([incident({ status: "CANCELLED" })])).toEqual({
			numerator: 0,
			denominator: 0,
			rate: null,
		});
	});

	it("counts false alarms against resolved, false and open incidents", () => {
		const incidents = [
			incident({ id: "a", status: "RESOLVED", resolvedAt: manila("2026-11-22T10:00:00") }),
			incident({ id: "b", status: "RESOLVED", resolvedAt: manila("2026-11-22T10:30:00") }),
			incident({ id: "c", status: "FALSE_ALARM" }),
			incident({ id: "d", status: "ACKNOWLEDGED" }),
			incident({ id: "e", status: "CANCELLED" }),
		];

		expect(falseAlarmRate(incidents)).toEqual({
			numerator: 1,
			denominator: 4,
			rate: 0.25,
		});
		expect(summarizeIncidents(incidents)).toEqual({
			total: 5,
			active: 1,
			resolved: 2,
			falseAlarms: 1,
			cancelled: 1,
			realCrashes: 3,
		});
	});
});

describe("hour of day", () => {
	it("buckets 00:00 and 23:59 Asia/Manila", () => {
		expect(manilaHour(manila("2026-11-21T00:00:00"))).toBe(0);
		expect(manilaHour(manila("2026-11-21T23:59:59"))).toBe(23);
		expect(manilaHour(new Date("2026-11-20T16:00:00Z"))).toBe(0);

		const hours = countByHour([
			{ detectedAt: manila("2026-11-21T00:00:00") },
			{ detectedAt: manila("2026-11-21T23:59:59") },
			{ detectedAt: new Date("2026-11-21T01:00:00Z") },
		]);

		expect(hours).toHaveLength(24);
		expect(hours[0]?.count).toBe(1);
		expect(hours[9]?.count).toBe(1);
		expect(hours[23]?.count).toBe(1);
		expect(hours.reduce((sum, hour) => sum + hour.count, 0)).toBe(3);
	});
});

describe("top vehicles", () => {
	it("orders by count and breaks ties on plate, then id", () => {
		const incidents = [
			incident({ vehicleId: "veh-1", vehicle: { plateNo: "BBB 2" } }),
			incident({ vehicleId: "veh-1", vehicle: { plateNo: "BBB 2" } }),
			incident({ vehicleId: "veh-2", vehicle: { plateNo: "AAA 1" } }),
			incident({ vehicleId: "veh-2", vehicle: { plateNo: "AAA 1" } }),
			incident({ vehicleId: "veh-3", vehicle: { plateNo: "CCC 3" } }),
			incident({ vehicleId: "veh-4", vehicle: { plateNo: "AAA 1" } }),
		];

		const top = topVehicles(incidents);
		expect(top.map((entry) => entry.vehicleId)).toEqual(["veh-2", "veh-1", "veh-4", "veh-3"]);
		expect(top.map((entry) => entry.count)).toEqual([2, 2, 1, 1]);
		expect(topVehicles(incidents, 1).map((entry) => entry.vehicleId)).toEqual(["veh-2"]);
	});

	it("sorts equal plates by vehicle id", () => {
		const top = topVehicles([
			incident({ vehicleId: "veh-b", vehicle: { plateNo: "SAME" } }),
			incident({ vehicleId: "veh-a", vehicle: { plateNo: "SAME" } }),
		]);
		expect(top.map((entry) => entry.vehicleId)).toEqual(["veh-a", "veh-b"]);
	});
});

describe("severity distribution", () => {
	it("keeps the severity order and fills empty bands with zero", () => {
		const distribution = severityDistribution([
			incident({ peakAccelG: 4.5, tiltDeg: 10 }),
			incident({ peakAccelG: 3.2, tiltDeg: 10 }),
			incident({ peakAccelG: 2.6, tiltDeg: 10 }),
			incident({ peakAccelG: 1.2, tiltDeg: 5 }),
			incident({ peakAccelG: 1.2, tiltDeg: 80 }),
		]);

		expect(distribution).toEqual([
			{ severity: "critical", count: 2 },
			{ severity: "high", count: 1 },
			{ severity: "moderate", count: 1 },
			{ severity: "low", count: 1 },
		]);
	});
});

describe("slowest responses", () => {
	it("orders by elapsed time with deterministic ties", () => {
		const slowest = slowestResponses([
			sample({ incidentId: "inc-a", plateNo: "BBB 2", elapsedMs: 12_000 }),
			sample({ incidentId: "inc-b", plateNo: "AAA 1", elapsedMs: 12_000 }),
			sample({ incidentId: "inc-c", plateNo: "CCC 3", elapsedMs: 5_000 }),
		]);

		expect(slowest.map((entry) => entry.incidentId)).toEqual(["inc-b", "inc-a", "inc-c"]);
		expect(slowestResponses([], 5)).toEqual([]);
	});
});
