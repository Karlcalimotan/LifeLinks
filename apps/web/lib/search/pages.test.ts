import { describe, expect, it } from "vitest";
import { SEARCH_PAGES, matchPages, visiblePages } from "./pages";

const labels = {
	dashboard: "Fleet overview",
	map: "Live map",
	vehicles: "Vehicles",
	incidents: "Incidents",
	analytics: "Analytics",
	notifications: "Notifications",
	devices: "Trackers",
	settings: "Settings",
} as const;

const candidates = SEARCH_PAGES.map((page) => ({
	...page,
	label: labels[page.key],
}));

const responder = { canAdminister: false, isUser: false };
const owner = { canAdminister: false, isUser: true };
const admin = { canAdminister: true, isUser: false };

describe("visiblePages", () => {
	it("hides admin-only destinations from responders", () => {
		expect(visiblePages(SEARCH_PAGES, responder).map((page) => page.key)).toEqual([
			"dashboard",
			"map",
			"vehicles",
			"incidents",
			"analytics",
			"notifications",
		]);
	});

	it("hides notifications and admin destinations from owners", () => {
		expect(visiblePages(SEARCH_PAGES, owner).map((page) => page.key)).toEqual([
			"dashboard",
			"map",
			"vehicles",
			"incidents",
			"analytics",
		]);
	});

	it("shows every destination to an admin", () => {
		expect(visiblePages(SEARCH_PAGES, admin)).toHaveLength(8);
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
		expect(matchPages(candidates, "charts").map((page) => page.key)).toEqual(["analytics"]);
		expect(matchPages(candidates, "gps").map((page) => page.key)).toEqual(["map", "devices"]);
	});

	it("matches the stable English key in any locale", () => {
		const translated = candidates.map((page) => ({ ...page, label: "Isinalin" }));
		expect(matchPages(translated, "vehicles").map((page) => page.key)).toEqual(["vehicles"]);
	});

	it("returns nothing when neither label nor keyword matches", () => {
		expect(matchPages(candidates, "zzzz")).toEqual([]);
	});
});
