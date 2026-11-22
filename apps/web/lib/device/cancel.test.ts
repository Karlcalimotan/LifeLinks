import { rateLimit } from "@/lib/rate-limit";
import { describe, expect, it } from "vitest";
import { CANCEL_RATE_LIMIT, evaluateCancelAttempt } from "./cancel";

const deadline = new Date("2026-11-23T10:00:00.000Z");

describe("device cancel decision", () => {
	it("accepts a cancel inside the window", () => {
		expect(
			evaluateCancelAttempt(
				{ status: "SUSPECTED", cancelDeadline: deadline },
				new Date(deadline.getTime() - 1),
			),
		).toEqual({ action: "cancel" });
	});

	it("accepts a confirmed incident until the deadline", () => {
		expect(
			evaluateCancelAttempt(
				{ status: "CONFIRMED", cancelDeadline: deadline },
				new Date(deadline.getTime()),
			),
		).toEqual({ action: "cancel" });
	});

	it("allows the 30 second clock-skew tolerance but not one millisecond more", () => {
		expect(
			evaluateCancelAttempt(
				{ status: "SUSPECTED", cancelDeadline: deadline },
				new Date(deadline.getTime() + 30_000),
			),
		).toEqual({ action: "cancel" });

		const late = evaluateCancelAttempt(
			{ status: "SUSPECTED", cancelDeadline: deadline },
			new Date(deadline.getTime() + 30_001),
		);
		expect(late).toEqual({
			action: "window_closed",
			deadline,
			lateByMs: 1,
		});
	});

	it("fails closed when the incident has no recorded deadline", () => {
		expect(evaluateCancelAttempt({ status: "CONFIRMED", cancelDeadline: null }, deadline)).toEqual({
			action: "window_closed",
			deadline: null,
			lateByMs: null,
		});
	});

	it("treats a repeated cancel as an idempotent duplicate", () => {
		expect(
			evaluateCancelAttempt({ status: "CANCELLED", cancelDeadline: deadline }, deadline),
		).toEqual({ action: "duplicate", status: "CANCELLED" });
	});

	it("does not change a terminal incident", () => {
		expect(
			evaluateCancelAttempt({ status: "RESOLVED", cancelDeadline: deadline }, deadline),
		).toEqual({ action: "terminal", status: "RESOLVED" });
		expect(
			evaluateCancelAttempt({ status: "FALSE_ALARM", cancelDeadline: deadline }, deadline),
		).toEqual({ action: "terminal", status: "FALSE_ALARM" });
	});

	it("refuses an incident an operator has already acknowledged", () => {
		expect(
			evaluateCancelAttempt({ status: "ACKNOWLEDGED", cancelDeadline: deadline }, deadline),
		).toEqual({ action: "not_cancellable", status: "ACKNOWLEDGED" });
	});

	it("limits repeated cancel reports per device", () => {
		for (let attempt = 0; attempt < CANCEL_RATE_LIMIT.limit; attempt += 1) {
			expect(
				rateLimit("device:a:incident-cancel", CANCEL_RATE_LIMIT.limit, CANCEL_RATE_LIMIT.windowMs)
					.allowed,
			).toBe(true);
		}
		const blocked = rateLimit(
			"device:a:incident-cancel",
			CANCEL_RATE_LIMIT.limit,
			CANCEL_RATE_LIMIT.windowMs,
		);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
	});
});
