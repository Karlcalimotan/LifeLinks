import { describe, expect, it } from "vitest";
import { acknowledgementDuration } from "./acknowledgement";

describe("acknowledgementDuration", () => {
	const detectedAt = new Date("2026-11-22T08:00:00.000Z");
	const now = new Date("2026-11-22T12:00:00.000Z");

	it("shows elapsed time for an open incident", () => {
		expect(
			acknowledgementDuration({ status: "CONFIRMED", detectedAt, acknowledgedAt: null, now }),
		).toBe("4h 0m");
		expect(
			acknowledgementDuration({ status: "SUSPECTED", detectedAt, acknowledgedAt: null, now }),
		).toBe("4h 0m");
	});

	it("shows the final duration for a closed incident with an audit row", () => {
		const acknowledgedAt = new Date("2026-11-22T08:09:30.000Z");
		expect(
			acknowledgementDuration({ status: "ACKNOWLEDGED", detectedAt, acknowledgedAt, now }),
		).toBe("9m 30s");
		expect(acknowledgementDuration({ status: "RESOLVED", detectedAt, acknowledgedAt, now })).toBe(
			"9m 30s",
		);
		expect(
			acknowledgementDuration({ status: "FALSE_ALARM", detectedAt, acknowledgedAt, now }),
		).toBe("9m 30s");
	});

	it("shows an em dash for a closed incident without an audit row", () => {
		expect(
			acknowledgementDuration({ status: "RESOLVED", detectedAt, acknowledgedAt: null, now }),
		).toBe("—");
		expect(
			acknowledgementDuration({ status: "CANCELLED", detectedAt, acknowledgedAt: null, now }),
		).toBe("—");
	});
});
