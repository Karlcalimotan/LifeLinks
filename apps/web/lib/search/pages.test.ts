import { describe, expect, it } from "vitest";
import { SEARCH_PAGES, matchPages, visiblePages } from "./pages";

const candidates = SEARCH_PAGES.map((page) => ({
	...page,
	label: {
		dashboard: "Fleet overview",
		vehicles: "Vehicles",
		incidents: "Incidents",
		devices: "Trackers",
		settings: "Settings",
	}[page.key],
}));

describe("visiblePages", () => {
	it("hides admin-only destinations from non-admins", () => {
		expect(visiblePages(SEARCH_PAGES, false).map((page) => page.key)).toEqual([
			"dashboard",
			"vehicles",
			"incidents",
		]);
	});

	it("shows every destination to an admin", () => {
		expect(visiblePages(SEARCH_PAGES, true)).toHaveLength(5);
	});
});

describe("matchPages", () => {
	it("returns every visible page for an empty query", () => {
		expect(matchPages(candidates, "  ")).toHaveLength(candidates.length);
	});

	it("matches the label case-insensitively", () => {
		expect(matchPages(candidates, "veh").map((page) => page.key)).toEqual(["vehicles"]);
	});

	it("matches a keyword", () => {
		expect(matchPages(candidates, "mac").map((page) => page.key)).toEqual(["devices"]);
		expect(matchPages(candidates, "crashes").map((page) => page.key)).toEqual(["incidents"]);
	});

	it("matches the stable English key in any locale", () => {
		const translated = candidates.map((page) => ({ ...page, label: "Isinalin" }));
		expect(matchPages(translated, "vehicles").map((page) => page.key)).toEqual(["vehicles"]);
	});

	it("returns nothing when neither label nor keyword matches", () => {
		expect(matchPages(candidates, "zzzz")).toEqual([]);
	});
});
