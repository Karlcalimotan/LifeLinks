import { describe, expect, it } from "vitest";
import {
	incidentAckRequestPath,
	incidentCancelRequestPath,
	incidentSuccessPath,
} from "./return-to";

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

describe("incidentCancelRequestPath", () => {
	it("marks the request without claiming the incident changed", () => {
		expect(incidentCancelRequestPath("en", "inc-1", "")).toBe(
			"/en/incidents/inc-1?cancel=requested",
		);
		expect(incidentCancelRequestPath("tl", "inc-1", "/incidents")).toBe(
			"/tl/incidents?cancel=requested",
		);
		expect(incidentCancelRequestPath("en", "inc-1", "/incidents?status=CONFIRMED")).toBe(
			"/en/incidents?status=CONFIRMED&cancel=requested",
		);
	});
});

describe("incidentAckRequestPath", () => {
	it("marks the request without claiming the incident changed", () => {
		expect(incidentAckRequestPath("en", "inc-1", "")).toBe("/en/incidents/inc-1?ack=requested");
		expect(incidentAckRequestPath("tl", "inc-1", "/incidents")).toBe("/tl/incidents?ack=requested");
		expect(incidentAckRequestPath("en", "inc-1", "/incidents?status=CONFIRMED")).toBe(
			"/en/incidents?status=CONFIRMED&ack=requested",
		);
	});
});
