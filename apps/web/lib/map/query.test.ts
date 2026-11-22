import { describe, expect, it } from "vitest";
import { type MapQuery, buildMapHref, hasActiveMapFilters, parseMapQuery } from "./query";

const base = parseMapQuery({});

function query(overrides: Partial<MapQuery> = {}): MapQuery {
	return { ...base, ...overrides };
}

describe("parseMapQuery", () => {
	it("returns defaults for an empty query", () => {
		expect(base).toEqual({ q: "", filter: "all", vehicle: null });
	});

	it("normalizes the filter and rejects unknown values", () => {
		expect(parseMapQuery({ filter: "LOW-BATTERY" }).filter).toBe("low-battery");
		expect(parseMapQuery({ filter: "online" }).filter).toBe("online");
		expect(parseMapQuery({ filter: "sleeping" }).filter).toBe("all");
		expect(parseMapQuery({ filter: "" }).filter).toBe("all");
	});

	it("trims and caps the search text", () => {
		expect(parseMapQuery({ q: "  navara  " }).q).toBe("navara");
		expect(parseMapQuery({ q: "x".repeat(120) }).q).toHaveLength(80);
	});

	it("keeps a plausible vehicle id and rejects anything else", () => {
		expect(parseMapQuery({ vehicle: "clx123abc" }).vehicle).toBe("clx123abc");
		expect(parseMapQuery({ vehicle: "veh_01-X" }).vehicle).toBe("veh_01-X");
		expect(parseMapQuery({ vehicle: "../../etc/passwd" }).vehicle).toBeNull();
		expect(parseMapQuery({ vehicle: "  " }).vehicle).toBeNull();
		expect(parseMapQuery({ vehicle: "x".repeat(80) }).vehicle).toBeNull();
	});

	it("uses the first value when a parameter repeats", () => {
		const parsed = parseMapQuery({
			q: ["navara", "hilux"],
			filter: ["offline", "online"],
			vehicle: ["clx1", "clx2"],
		});
		expect(parsed).toEqual({ q: "navara", filter: "offline", vehicle: "clx1" });
	});
});

describe("buildMapHref", () => {
	it("omits defaults", () => {
		expect(buildMapHref(base)).toBe("/map");
	});

	it("keeps search, filter and selection", () => {
		const href = buildMapHref(query({ q: "navara 4x4", filter: "incident", vehicle: "clx1" }));
		const params = new URLSearchParams(href.split("?")[1]);

		expect(href.startsWith("/map?")).toBe(true);
		expect(params.get("q")).toBe("navara 4x4");
		expect(params.get("filter")).toBe("incident");
		expect(params.get("vehicle")).toBe("clx1");
	});

	it("applies overrides without mutating the input", () => {
		const current = query({ q: "navara", filter: "offline", vehicle: "clx1" });
		const next = buildMapHref(current, { filter: "online", vehicle: null });

		expect(new URLSearchParams(next.split("?")[1]).get("filter")).toBe("online");
		expect(new URLSearchParams(next.split("?")[1]).get("vehicle")).toBeNull();
		expect(new URLSearchParams(next.split("?")[1]).get("q")).toBe("navara");
		expect(current).toEqual({ q: "navara", filter: "offline", vehicle: "clx1" });
	});

	it("clears everything when overrides reset the defaults", () => {
		const current = query({ q: "navara", filter: "incident", vehicle: "clx1" });
		expect(buildMapHref(current, { q: "", filter: "all", vehicle: null })).toBe("/map");
	});

	it("round-trips through the query string", () => {
		const current = query({ q: "navara 4x4", filter: "low-battery", vehicle: "clx9" });
		const href = buildMapHref(current);
		const decoded = Object.fromEntries(new URLSearchParams(href.split("?")[1]));

		expect(parseMapQuery(decoded)).toEqual(current);
	});
});

describe("hasActiveMapFilters", () => {
	it("is false only for a clean map URL", () => {
		expect(hasActiveMapFilters(base)).toBe(false);
		expect(hasActiveMapFilters(query({ q: "navara" }))).toBe(true);
		expect(hasActiveMapFilters(query({ filter: "offline" }))).toBe(true);
		expect(hasActiveMapFilters(query({ vehicle: "clx1" }))).toBe(true);
	});
});
