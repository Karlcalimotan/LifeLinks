import { describe, expect, it } from "vitest";
import { MAX_TRANSMISSION_DELAY_S, readTransmissionDelay } from "./transmission";

const received = new Date("2026-11-25T10:00:00.000Z");

function sentSecondsBefore(seconds: number): Date {
	return new Date(received.getTime() - seconds * 1000);
}

describe("transmission delay", () => {
	it("reports a missing send time as not measured", () => {
		expect(readTransmissionDelay({ sentAt: null, receivedAt: received })).toBeNull();
		expect(readTransmissionDelay({ sentAt: undefined, receivedAt: received })).toBeNull();
	});

	it("reports a missing receipt anchor as not measured", () => {
		expect(readTransmissionDelay({ sentAt: received, receivedAt: null })).toBeNull();
		expect(readTransmissionDelay({ sentAt: received, receivedAt: undefined })).toBeNull();
	});

	it("accepts a gap of zero seconds", () => {
		const result = readTransmissionDelay({ sentAt: received, receivedAt: received });
		expect(result?.delaySeconds).toBe(0);
	});

	it("rejects a send time after the console received the report", () => {
		expect(
			readTransmissionDelay({ sentAt: sentSecondsBefore(-1), receivedAt: received }),
		).toBeNull();
	});

	it("accepts the one-hour boundary", () => {
		const sentAt = sentSecondsBefore(MAX_TRANSMISSION_DELAY_S);
		expect(readTransmissionDelay({ sentAt, receivedAt: received })).toEqual({
			sentAt,
			delaySeconds: MAX_TRANSMISSION_DELAY_S,
		});
	});

	it("rejects a gap above the one-hour boundary", () => {
		expect(
			readTransmissionDelay({
				sentAt: sentSecondsBefore(MAX_TRANSMISSION_DELAY_S + 1),
				receivedAt: received,
			}),
		).toBeNull();
	});

	it("rounds a sub-second gap to whole seconds", () => {
		const result = readTransmissionDelay({
			sentAt: new Date(received.getTime() - 1500),
			receivedAt: received,
		});
		expect(result?.delaySeconds).toBe(2);
	});

	it("rejects an unreadable date instead of producing NaN", () => {
		expect(
			readTransmissionDelay({ sentAt: new Date("not a date"), receivedAt: received }),
		).toBeNull();
	});
});
