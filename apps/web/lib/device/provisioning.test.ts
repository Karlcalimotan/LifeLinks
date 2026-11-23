import { describe, expect, it } from "vitest";
import { PROVISIONING_FRESH_MS, provisioningApName, provisioningState } from "./provisioning";

describe("provisioning AP name", () => {
	it("uses the last four hex digits of the MAC", () => {
		expect(provisioningApName("24:6F:28:B4:7A:01")).toBe("LifeLink-7A01");
	});

	it("matches the firmware test vector", () => {
		expect(provisioningApName("AA:BB:CC:DD:EE:FF")).toBe("LifeLink-EEFF");
	});

	it("uppercases lowercase input and ignores separators", () => {
		expect(provisioningApName("24-6f-28-b4-7a-0f")).toBe("LifeLink-7A0F");
	});

	it("zero pads when fewer than four hex digits remain", () => {
		expect(provisioningApName("AB")).toBe("LifeLink-00AB");
	});

	it("matches the firmware fallback for empty or missing input", () => {
		expect(provisioningApName("")).toBe("LifeLink-0000");
		expect(provisioningApName(null)).toBe("LifeLink-0000");
		expect(provisioningApName(undefined)).toBe("LifeLink-0000");
	});
});

describe("provisioning state", () => {
	const now = new Date("2026-11-23T12:00:00+08:00");
	const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

	it("is needs_setup for a tracker that has never reported", () => {
		expect(provisioningState(null, now)).toBe("needs_setup");
		expect(provisioningState(undefined, now)).toBe("needs_setup");
	});

	it("is configured inside the five minute window", () => {
		expect(provisioningState(minutesAgo(0), now)).toBe("configured");
		expect(provisioningState(minutesAgo(4), now)).toBe("configured");
		expect(provisioningState(new Date(now.getTime() - PROVISIONING_FRESH_MS + 1), now)).toBe(
			"configured",
		);
	});

	it("is needs_setup at and after the five minute boundary", () => {
		expect(provisioningState(minutesAgo(5), now)).toBe("needs_setup");
		expect(provisioningState(minutesAgo(6), now)).toBe("needs_setup");
		expect(provisioningState(minutesAgo(60 * 24), now)).toBe("needs_setup");
	});

	it("is needs_setup for an invalid or future timestamp", () => {
		expect(provisioningState("not-a-date", now)).toBe("needs_setup");
		expect(provisioningState(new Date(now.getTime() + 60_000), now)).toBe("needs_setup");
	});

	it("accepts ISO strings from the database", () => {
		expect(provisioningState(minutesAgo(1).toISOString(), now)).toBe("configured");
		expect(provisioningState(minutesAgo(10).toISOString(), now)).toBe("needs_setup");
	});
});
