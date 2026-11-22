import { describe, expect, it } from "vitest";
import { incidentSuccessPath } from "./return-to";

describe("incidentSuccessPath", () => {
	it("sends the dashboard acknowledgement back to the dashboard", () => {
		expect(incidentSuccessPath("en", "inc-1", "dashboard")).toBe(
			"/en/dashboard?updated=acknowledged",
		);
		expect(incidentSuccessPath("tl", "inc-1", "dashboard")).toBe(
			"/tl/dashboard?updated=acknowledged",
		);
	});

	it("returns to an incidents board path and appends updated", () => {
		expect(incidentSuccessPath("en", "inc-1", "/incidents")).toBe("/en/incidents?updated=1");
		expect(incidentSuccessPath("en", "inc-1", "/incidents?status=CONFIRMED")).toBe(
			"/en/incidents?status=CONFIRMED&updated=1",
		);
		expect(incidentSuccessPath("en", "inc-1", "/incidents/inc-1")).toBe(
			"/en/incidents/inc-1?updated=1",
		);
	});

	it("falls back to the detail page for anything else", () => {
		expect(incidentSuccessPath("en", "inc-1", "")).toBe("/en/incidents/inc-1?updated=1");
		expect(incidentSuccessPath("en", "inc-1", "/settings")).toBe("/en/incidents/inc-1?updated=1");
		expect(incidentSuccessPath("en", "inc-1", "https://example.com")).toBe(
			"/en/incidents/inc-1?updated=1",
		);
	});
});
