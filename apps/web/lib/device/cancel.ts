import type { ImpactStatusName } from "@/lib/incidents/state";

/** Devices may retry just after the deadline; allow for scheduler/clock skew. */
export const CANCEL_CLOCK_SKEW_MS = 30_000;

/** The device route may only cancel an incident before an operator handles it. */
export const CANCELLABLE_STATUSES = ["SUSPECTED", "CONFIRMED"] as const;

/** Per-device budget for cancel reports (including retries). */
export const CANCEL_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

export type CancelDecision =
	| { action: "cancel" }
	| { action: "duplicate"; status: "CANCELLED" }
	| { action: "terminal"; status: "RESOLVED" | "FALSE_ALARM" }
	| { action: "not_cancellable"; status: ImpactStatusName }
	| { action: "window_closed"; deadline: Date | null; lateByMs: number | null };

interface CancelCandidate {
	status: ImpactStatusName;
	cancelDeadline: Date | null;
}

/**
 * Decide what a driver-cancel report means without touching the database.
 *
 * The server clock is authoritative: `cancelled_at` is kept for audit, but a
 * device with a wrong clock cannot reopen or extend its own cancel window.
 */
export function evaluateCancelAttempt(incident: CancelCandidate, now = new Date()): CancelDecision {
	if (incident.status === "CANCELLED") {
		return { action: "duplicate", status: "CANCELLED" };
	}
	if (incident.status === "RESOLVED" || incident.status === "FALSE_ALARM") {
		return { action: "terminal", status: incident.status };
	}
	if (incident.status !== "SUSPECTED" && incident.status !== "CONFIRMED") {
		return { action: "not_cancellable", status: incident.status };
	}
	if (!incident.cancelDeadline) {
		// No recorded window means the server cannot prove the cancel is timely.
		// Fail closed rather than inventing a deadline.
		return { action: "window_closed", deadline: null, lateByMs: null };
	}

	const lateByMs = now.getTime() - (incident.cancelDeadline.getTime() + CANCEL_CLOCK_SKEW_MS);
	if (lateByMs > 0) {
		return { action: "window_closed", deadline: incident.cancelDeadline, lateByMs };
	}
	return { action: "cancel" };
}
