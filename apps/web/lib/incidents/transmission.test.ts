import { describe, expect, it } from "vitest";
import { MAX_TRANSMISSION_DELAY_S, readTransmissionDelay } from "./transmission";

const received = new Date("2026-11-25T10:00:00.000Z");

function sentSecondsBefore(seconds: number): Date {
	return new Date(received.getTime() - seconds * 1000);
}

describe("transmission delay", () => {
	it("reports a missing send time as not measured", () => {
		expect(readTransmissionDelay({ sentAt: null, createdAt: received })).toBeNull();
		expect(readTransmissionDelay({ sentAt: undefined, createdAt: received })).toBeNull();
	});

	it("accepts a gap of zero seconds", () => {
		const result = readTransmissionDelay({ sentAt: received, createdAt: received });
		expect(result?.delaySeconds).toBe(0);
	});

	it("rejects a send time after the console received the report", () => {
		expect(
			readTransmissionDelay({ sentAt: sentSecondsBefore(-1), createdAt: received }),
		).toBeNull();
	});

	it("accepts the one-hour boundary", () => {
		const sentAt = sentSecondsBefore(MAX_TRANSMISSION_DELAY_S);
		expect(readTransmissionDelay({ sentAt, createdAt: received })).toEqual({
			sentAt,
			delaySeconds: MAX_TRANSMISSION_DELAY_S,
		});
	});

	it("rejects a gap above the one-hour boundary", () => {
		expect(
			readTransmissionDelay({
				sentAt: sentSecondsBefore(MAX_TRANSMISSION_DELAY_S + 1),
				createdAt: received,
			}),
		).toBeNull();
	});

	it("rounds a sub-second gap to whole seconds", () => {
		const result = readTransmissionDelay({
			sentAt: new Date(received.getTime() - 1500),
			createdAt: received,
		});
		expect(result?.delaySeconds).toBe(2);
	});

	it("rejects an unreadable date instead of producing NaN", () => {
		expect(
			readTransmissionDelay({ sentAt: new Date("not a date"), createdAt: received }),
		).toBeNull();
	});
});
