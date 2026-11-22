import { describe, expect, it } from "vitest";
import {
	SEARCH_QUERY_MAX,
	SEARCH_RESULT_LIMIT,
	matchScore,
	parseSearchQuery,
	rankSearchResults,
	resultScore,
} from "./query";

const result = (overrides: Partial<Parameters<typeof resultScore>[0]> & { id: string }) => ({
	type: "vehicle",
	title: "",
	subtitle: null,
	meta: null,
	...overrides,
});

describe("parseSearchQuery", () => {
	it("returns an empty string for missing or non-string input", () => {
		expect(parseSearchQuery(null)).toBe("");
		expect(parseSearchQuery(undefined)).toBe("");
		expect(parseSearchQuery("   ")).toBe("");
	});

	it("trims and collapses whitespace", () => {
		expect(parseSearchQuery("  navara \n\t 4x4 ")).toBe("navara 4x4");
	});

	it("caps the query at 80 characters", () => {
		const long = "a".repeat(SEARCH_QUERY_MAX + 40);
		const parsed = parseSearchQuery(long);
		expect(parsed).toHaveLength(SEARCH_QUERY_MAX);
		expect(parsed).toBe("a".repeat(SEARCH_QUERY_MAX));
	});

	it("caps after trimming so padding cannot consume the budget", () => {
		const padded = `  ${"b".repeat(SEARCH_QUERY_MAX)}  `;
		expect(parseSearchQuery(padded)).toHaveLength(SEARCH_QUERY_MAX);
	});
});

describe("matchScore", () => {
	it("ranks exact over prefix over contains", () => {
		expect(matchScore("ABC 123", "abc 123")).toBe(3);
		expect(matchScore("ABC 123", "abc")).toBe(2);
		expect(matchScore("XYZ ABC 123", "abc")).toBe(1);
		expect(matchScore("XYZ 123", "abc")).toBe(0);
	});

	it("ignores empty values", () => {
		expect(matchScore(null, "abc")).toBe(0);
		expect(matchScore("abc", "")).toBe(0);
	});
});

describe("resultScore", () => {
	it("uses the best field, including the id", () => {
		expect(resultScore(result({ id: "clx123", title: "Navara" }), "clx123")).toBe(3);
		expect(resultScore(result({ id: "x", title: "Navara", meta: "ABC 123" }), "abc")).toBe(2);
	});
});

describe("rankSearchResults", () => {
	it("puts the exact title first regardless of type order", () => {
		const ranked = rankSearchResults(
			[
				result({ id: "1", type: "vehicle", title: "ABC 999" }),
				result({ id: "2", type: "device", title: "ABC 123" }),
			],
			"abc 123",
		);
		expect(ranked[0]?.id).toBe("2");
	});

	it("breaks ties by type and then title", () => {
		const ranked = rankSearchResults(
			[
				result({ id: "i", type: "incident", title: "AAA 111" }),
				result({ id: "v", type: "vehicle", title: "AAA 111" }),
				result({ id: "d", type: "device", title: "AAA 111" }),
				result({ id: "p", type: "page", title: "AAA 111" }),
			],
			"aaa",
		);
		expect(ranked.map((entry) => entry.id)).toEqual(["p", "v", "i", "d"]);
	});

	it("caps the list at the result limit", () => {
		const many = Array.from({ length: 20 }, (_, index) => ({
			type: "vehicle" as const,
			id: `id-${index}`,
			title: `PLATE ${index}`,
			subtitle: null,
			meta: null,
		}));
		expect(rankSearchResults(many, "plate")).toHaveLength(SEARCH_RESULT_LIMIT);
	});
});
