import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, demoModeEnabled } from "./demo";

describe("demo login panel", () => {
	it("requires the exact opt-in value", () => {
		expect(demoModeEnabled({ DEMO_MODE: "true" })).toBe(true);
		expect(demoModeEnabled({ DEMO_MODE: "TRUE" })).toBe(false);
		expect(demoModeEnabled({ DEMO_MODE: "1" })).toBe(false);
		expect(demoModeEnabled({})).toBe(false);
	});

	it("keeps the documented demo accounts in the server-only module", () => {
		expect(DEMO_ACCOUNTS.map((account) => account.email)).toEqual([
			"admin@lifelink.local",
			"owner@lifelink.local",
			"responder@lifelink.local",
		]);
	});
});
