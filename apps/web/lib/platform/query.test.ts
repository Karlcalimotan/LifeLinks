import { describe, expect, it } from "vitest";
import {
	PLATFORM_PAGE_SIZE,
	buildPlatformHref,
	clampPlatformPage,
	hasPlatformFilters,
	parsePlatformQuery,
	platformOrgWhere,
} from "./query";

describe("platform organization query", () => {
	it("defaults to all organizations on page one", () => {
		expect(parsePlatformQuery()).toEqual({ q: "", status: "all", page: 1 });
	});

	it("parses a status, a bounded search and a positive page", () => {
		expect(
			parsePlatformQuery({
				q: "  Acme  ",
				status: "suspended",
				page: "3",
			}),
		).toEqual({ q: "Acme", status: "suspended", page: 3 });

		expect(parsePlatformQuery({ q: "x".repeat(120), status: "other", page: "-2" })).toEqual({
			q: "x".repeat(100),
			status: "all",
			page: 1,
		});
	});

	it("builds the status and search filters", () => {
		expect(platformOrgWhere({ q: "acme", status: "active", page: 1 })).toEqual({
			status: "ACTIVE",
			OR: [
				{ name: { contains: "acme", mode: "insensitive" } },
				{ slug: { contains: "acme", mode: "insensitive" } },
			],
		});
		expect(platformOrgWhere({ q: "", status: "suspended", page: 1 })).toEqual({
			status: "SUSPENDED",
		});
		expect(platformOrgWhere({ q: "", status: "all", page: 1 })).toEqual({});
	});

	it("detects active filters", () => {
		expect(hasPlatformFilters({ q: "", status: "all", page: 1 })).toBe(false);
		expect(hasPlatformFilters({ q: "acme", status: "all", page: 1 })).toBe(true);
		expect(hasPlatformFilters({ q: "", status: "suspended", page: 1 })).toBe(true);
	});

	it("clamps a page to the rows that exist", () => {
		expect(clampPlatformPage(1, 0)).toEqual({
			page: 1,
			pageCount: 1,
			skip: 0,
			take: PLATFORM_PAGE_SIZE,
		});
		expect(clampPlatformPage(99, 60)).toEqual({
			page: 3,
			pageCount: 3,
			skip: 50,
			take: PLATFORM_PAGE_SIZE,
		});
	});

	it("builds shareable URLs and omits defaults", () => {
		expect(buildPlatformHref({ q: "", status: "all", page: 1 })).toBe("/platform");
		expect(buildPlatformHref({ q: "acme", status: "suspended", page: 1 }, { page: 2 })).toBe(
			"/platform?q=acme&status=suspended&page=2",
		);
	});
});
