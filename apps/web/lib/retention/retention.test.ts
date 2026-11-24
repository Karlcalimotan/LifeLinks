// @vitest-environment node
import { describe, expect, it } from "vitest";
import { retentionCutoff } from "./retention";

describe("retentionCutoff", () => {
	it("subtracts the configured number of days from now", () => {
		const now = new Date("2026-11-25T12:00:00.000Z");
		expect(retentionCutoff(now, 30)?.toISOString()).toBe("2026-10-26T12:00:00.000Z");
		expect(retentionCutoff(now, 1)?.toISOString()).toBe("2026-11-24T12:00:00.000Z");
		expect(retentionCutoff(now, 365)?.toISOString()).toBe("2025-11-25T12:00:00.000Z");
	});

	it("does not move the cutoff for a corrupt period", () => {
		const now = new Date("2026-11-25T12:00:00.000Z");
		expect(retentionCutoff(now, 0)).toBeNull();
		expect(retentionCutoff(now, -1)).toBeNull();
		expect(retentionCutoff(now, Number.NaN)).toBeNull();
		expect(retentionCutoff(now, Number.POSITIVE_INFINITY)).toBeNull();
	});
});
