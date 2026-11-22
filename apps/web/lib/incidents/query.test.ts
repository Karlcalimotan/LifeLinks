import { describe, expect, it } from "vitest";
import {
	INCIDENT_PAGE_SIZE,
	MAX_PAGE,
	buildIncidentsHref,
	hasActiveFilters,
	incidentWhere,
	parseIncidentsQuery,
	severityWhere,
} from "./query";
import { type Severity, severityFor } from "./severity";

const base = parseIncidentsQuery({});

describe("parseIncidentsQuery", () => {
	it("returns safe defaults for an empty query", () => {
		expect(base).toEqual({
			q: "",
			status: null,
			severity: null,
			range: "all",
			sort: "detected",
			dir: "desc",
			page: 1,
			pageSize: INCIDENT_PAGE_SIZE,
		});
	});

	it("ignores invalid filters, sort, direction and page values", () => {
		const query = parseIncidentsQuery({
			status: "ARCHIVED",
			severity: "catastrophic",
			range: "90",
			sort: "createdAt",
			dir: "sideways",
			page: "not-a-number",
		});

		expect(query.status).toBeNull();
		expect(query.severity).toBeNull();
		expect(query.range).toBe("all");
		expect(query.sort).toBe("detected");
		expect(query.dir).toBe("desc");
		expect(query.page).toBe(1);
	});

	it("normalizes valid values and keeps the first array entry", () => {
		const query = parseIncidentsQuery({
			q: ["  navara  ", "ignored"],
			status: ["confirmed", "resolved"],
			severity: "HIGH",
			range: "7",
			dir: "ASC",
			page: "3",
		});

		expect(query.q).toBe("navara");
		expect(query.status).toBe("CONFIRMED");
		expect(query.severity).toBe("high");
		expect(query.range).toBe("7");
		expect(query.dir).toBe("asc");
		expect(query.page).toBe(3);
	});

	it("trims the search term to 80 characters", () => {
		const query = parseIncidentsQuery({ q: `  ${"a".repeat(120)}  ` });
		expect(query.q).toHaveLength(80);
	});

	it("bounds the page to one and the maximum page", () => {
		expect(parseIncidentsQuery({ page: "0" }).page).toBe(1);
		expect(parseIncidentsQuery({ page: "-4" }).page).toBe(1);
		expect(parseIncidentsQuery({ page: String(MAX_PAGE + 50) }).page).toBe(MAX_PAGE);
	});
});

describe("buildIncidentsHref", () => {
	it("omits defaults", () => {
		expect(buildIncidentsHref(base)).toBe("/incidents");
	});

	it("round-trips every active filter through the URL", () => {
		const query = parseIncidentsQuery({
			q: "navara 4x4",
			status: "CONFIRMED",
			severity: "high",
			range: "7",
			dir: "asc",
			page: "2",
		});
		const href = buildIncidentsHref(query);
		const params = Object.fromEntries(new URLSearchParams(href.split("?")[1]));

		expect(parseIncidentsQuery(params)).toEqual(query);
	});

	it("applies overrides for pagination, sorting and clearing filters", () => {
		const query = parseIncidentsQuery({
			q: "navara",
			severity: "critical",
			range: "14",
			page: "2",
		});
		const next = buildIncidentsHref(query, { page: 3 });
		const cleared = buildIncidentsHref(query, {
			q: "",
			severity: null,
			range: "all",
			page: 1,
		});

		expect(new URLSearchParams(next.split("?")[1]).get("page")).toBe("3");
		expect(cleared).toBe("/incidents");
	});
});

describe("hasActiveFilters", () => {
	it("is false only when no filter is set", () => {
		expect(hasActiveFilters(base)).toBe(false);
		expect(hasActiveFilters(parseIncidentsQuery({ q: "navara" }))).toBe(true);
		expect(hasActiveFilters(parseIncidentsQuery({ status: "RESOLVED" }))).toBe(true);
		expect(hasActiveFilters(parseIncidentsQuery({ severity: "critical" }))).toBe(true);
		expect(hasActiveFilters(parseIncidentsQuery({ range: "30" }))).toBe(true);
	});
});

type Filter = Record<string, unknown>;

function matchesNumber(condition: Record<string, number>, value: number): boolean {
	if (condition.gte != null && value < condition.gte) return false;
	if (condition.lt != null && value >= condition.lt) return false;
	return true;
}

/** Interpret the small subset of the Prisma filter that `severityWhere` emits. */
function matches(where: Filter, peakAccelG: number, tiltDeg: number): boolean {
	if (Array.isArray(where.AND)) {
		if (!(where.AND as Filter[]).every((entry) => matches(entry, peakAccelG, tiltDeg))) {
			return false;
		}
	}
	if (Array.isArray(where.OR)) {
		if (!(where.OR as Filter[]).some((entry) => matches(entry, peakAccelG, tiltDeg))) {
			return false;
		}
	}
	if (where.peakAccelG) {
		if (!matchesNumber(where.peakAccelG as Record<string, number>, peakAccelG)) return false;
	}
	if (where.tiltDeg) {
		if (!matchesNumber(where.tiltDeg as Record<string, number>, tiltDeg)) return false;
	}
	return true;
}

describe("severityWhere", () => {
	const peaks = [0, 2.49, 2.5, 2.99, 3, 3.99, 4, 5];
	const tilts = [0, 44.9, 45, 59.9, 60, 74.9, 75, 90];
	const severities: Severity[] = ["critical", "high", "moderate", "low"];

	it("matches severityFor on every band boundary", () => {
		for (const peak of peaks) {
			for (const tilt of tilts) {
				for (const severity of severities) {
					expect(
						matches(severityWhere(severity) as Filter, peak, tilt),
						`peak ${peak} g, tilt ${tilt} deg, severity ${severity}`,
					).toBe(severityFor(peak, tilt) === severity);
				}
			}
		}
	});
});

describe("incidentWhere", () => {
	const now = new Date("2026-11-22T12:00:00.000Z");
	const scope = { orgId: "org-1" };

	it("keeps the scope and searches plate, driver, incident id and coordinates", () => {
		const where = incidentWhere(scope, parseIncidentsQuery({ q: "navara" }), now);

		expect(where.orgId).toBe("org-1");
		expect(where.OR).toEqual([
			{ id: { contains: "navara", mode: "insensitive" } },
			{ vehicle: { is: { plateNo: { contains: "navara", mode: "insensitive" } } } },
			{ vehicle: { is: { driverName: { contains: "navara", mode: "insensitive" } } } },
		]);
	});

	it("turns a coordinate pair into a proximity filter", () => {
		const where = incidentWhere(scope, parseIncidentsQuery({ q: "10.7202, 122.5621" }), now);

		expect(where.OR).toEqual([
			{ id: { contains: "10.7202, 122.5621", mode: "insensitive" } },
			{
				vehicle: {
					is: { plateNo: { contains: "10.7202, 122.5621", mode: "insensitive" } },
				},
			},
			{
				vehicle: {
					is: { driverName: { contains: "10.7202, 122.5621", mode: "insensitive" } },
				},
			},
			{
				AND: [{ lat: { gte: 10.7192, lte: 10.7212 } }, { lng: { gte: 122.5611, lte: 122.5631 } }],
			},
		]);
	});

	it("combines status, severity and date range", () => {
		const where = incidentWhere(
			scope,
			parseIncidentsQuery({ status: "CONFIRMED", severity: "high", range: "7" }),
			now,
		);

		expect(where.status).toBe("CONFIRMED");
		expect(where.AND).toEqual([
			severityWhere("high"),
			{ detectedAt: { gte: new Date("2026-11-15T12:00:00.000Z") } },
		]);
	});

	it("leaves status out when a status chip is not selected", () => {
		const where = incidentWhere(scope, base, now);
		expect(where.status).toBeUndefined();
		expect(where.AND).toBeUndefined();
		expect(where.OR).toBeUndefined();
	});
});
