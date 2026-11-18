import { describe, expect, it } from "vitest";
import { plausibleEpochSeconds, resolveDeviceTime } from "./time";

const NOW = new Date("2026-11-18T12:00:00+08:00");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

describe("device clock validation", () => {
	it("accepts the current time and a small future skew", () => {
		expect(plausibleEpochSeconds(nowSeconds, NOW.getTime())).toBe(true);
		expect(plausibleEpochSeconds(nowSeconds + 60, NOW.getTime())).toBe(true);
	});

	it("rejects a clock far in the future or the distant past", () => {
		expect(plausibleEpochSeconds(nowSeconds + 3600, NOW.getTime())).toBe(false);
		expect(plausibleEpochSeconds(nowSeconds - 40 * 24 * 3600, NOW.getTime())).toBe(false);
	});

	it("falls back to receipt time for an impossible timestamp", () => {
		const resolved = resolveDeviceTime(1, NOW);
		expect(resolved.toISOString()).toBe(NOW.toISOString());
	});

	it("keeps a plausible device timestamp", () => {
		const resolved = resolveDeviceTime(nowSeconds - 30, NOW);
		expect(Math.floor(resolved.getTime() / 1000)).toBe(nowSeconds - 30);
	});
});
