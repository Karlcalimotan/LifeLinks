import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, demoModeEnabled } from "./demo";

describe("demo login panel", () => {
	it("requires the exact opt-in value in a development or test environment", () => {
		expect(demoModeEnabled({ DEMO_MODE: "true", NODE_ENV: "development" })).toBe(true);
		expect(demoModeEnabled({ DEMO_MODE: "true", NODE_ENV: "test" })).toBe(true);
		expect(demoModeEnabled({ DEMO_MODE: "true", NODE_ENV: "production" })).toBe(false);
		expect(demoModeEnabled({ DEMO_MODE: "true", NODE_ENV: "staging" })).toBe(false);
		expect(demoModeEnabled({ DEMO_MODE: "true" })).toBe(false);
		expect(demoModeEnabled({ DEMO_MODE: "TRUE", NODE_ENV: "development" })).toBe(false);
		expect(demoModeEnabled({ DEMO_MODE: "1", NODE_ENV: "development" })).toBe(false);
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
