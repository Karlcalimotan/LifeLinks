import type { ImpactStatusName } from "@/lib/incidents/state";

/**
 * Post-dispatch false alarm: the web asks the tracker to stand down and the
 * incident changes only when the tracker confirms. The contract is frozen in
 * `docs/delegation-plan.md`. `payload.incident_id` is the tracker's own client
 * incident id (`llk-...`), not the server ImpactEvent id; the command row keeps
 * the server id in `impactEventId`.
 */
export const CANCEL_ALERT_KIND = "CANCEL_ALERT" as const;
export const CANCEL_ALERT_REASON = "false_alarm" as const;

/** The tracker polls every few seconds; ten minutes matches the other commands. */
export const CANCEL_ALERT_COMMAND_TTL_MS = 10 * 60 * 1000;

/** Stored on the incident only after the tracker confirms the stand-down. */
export const CANCEL_ALERT_RESOLUTION = "False alarm confirmed by tracker";

export type CancelAckDetail = "cancelled" | "too_late" | "unknown_incident";

export const CANCEL_ACK_DETAILS: readonly CancelAckDetail[] = [
	"cancelled",
	"too_late",
	"unknown_incident",
];

/**
 * The tracker may still be counting down or retrying in these states. A
 * driver-cancelled incident is excluded: the device already stopped itself.
 */
export const CANCEL_ALERT_ELIGIBLE_STATUSES = [
	"SUSPECTED",
	"CONFIRMED",
	"ACKNOWLEDGED",
] as const satisfies readonly ImpactStatusName[];

/**
 * A confirmation may close these statuses. CANCELLED is deliberately absent:
 * a driver cancel already stopped the tracker, and a late ACK must not rewrite
 * that incident. The operator can still mark a CANCELLED incident as a false
 * alarm locally from the incident detail.
 */
export const CANCEL_ALERT_CLOSABLE_STATUSES = [
	"SUSPECTED",
	"CONFIRMED",
	"ACKNOWLEDGED",
] as const satisfies readonly ImpactStatusName[];

export type CancelAlertPayload = {
	incident_id: string;
	reason: typeof CANCEL_ALERT_REASON;
	all_clear: true;
};

/**
 * The exact payload frozen in the delegation plan. The id is the device client
 * incident id, because the firmware compares it with its own `g_incidentId`.
 */
export function buildCancelAlertPayload(clientIncidentId: string): CancelAlertPayload {
	return { incident_id: clientIncidentId, reason: CANCEL_ALERT_REASON, all_clear: true };
}

/** Whether an operator may ask the tracker to stand down for this status. */
export function canRequestCancelAlert(status: ImpactStatusName): boolean {
	return (CANCEL_ALERT_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

/** Whether a tracker confirmation may close this status as FALSE_ALARM. */
export function canCloseCancelAlert(status: ImpactStatusName): boolean {
	return (CANCEL_ALERT_CLOSABLE_STATUSES as readonly string[]).includes(status);
}

function payloadRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function readCancelAckDetail(payload: unknown): string | null {
	const detail = payloadRecord(payload).ackDetail;
	return typeof detail === "string" && detail.length > 0 ? detail : null;
}

export type CancelAckOutcome =
	| "cancelled"
	| "too_late"
	| "unknown_incident"
	| "unconfirmed"
	| "failed";

/**
 * Map a device acknowledgement to what actually happened. Anything that is not
 * one of the three contract details is "unconfirmed", never "cancelled": a
 * generic ACK from older firmware is not proof that the alert stopped.
 */
export function classifyCancelAck({
	status,
	detail,
}: {
	status: string;
	detail?: string | null;
}): CancelAckOutcome {
	if (status === "FAILED") return "failed";
	if (detail === "cancelled" || detail === "too_late" || detail === "unknown_incident") {
		return detail;
	}
	return "unconfirmed";
}

export interface CancelAlertCommandView {
	id: string;
	kind: string;
	status: string;
	payload: unknown;
	impactEventId: string | null;
	createdAt: Date;
	expiresAt: Date | null;
}

/** The newest CANCEL_ALERT command that belongs to this server incident. */
export function latestCancelAlertCommand(
	incidentId: string,
	commands: readonly CancelAlertCommandView[],
): CancelAlertCommandView | null {
	let latest: CancelAlertCommandView | null = null;
	for (const command of commands) {
		if (command.kind !== CANCEL_ALERT_KIND) continue;
		if (command.impactEventId !== incidentId) continue;
		if (!latest || command.createdAt.getTime() > latest.createdAt.getTime()) latest = command;
	}
	return latest;
}

export type CancelAlertStateName = "idle" | "waiting" | "confirmed" | "not_confirmed" | "failed";

export interface CancelAlertView {
	state: CancelAlertStateName;
	detail: string | null;
	commandId: string | null;
	requestedAt: Date | null;
}

/**
 * What the incident detail should say about a stand-down request. The status is
 * the operator-visible truth; the command is the device-visible truth. The two
 * are only merged when the tracker actually confirmed.
 *
 * `now` lets a PENDING command that outlived its expiry become "not confirmed".
 * Without it a tracker that never polls would leave the banner waiting forever.
 */
export function readCancelAlertState({
	incidentId,
	status,
	cancelRequestedAt,
	commands,
	now = new Date(),
}: {
	incidentId: string;
	status: string;
	cancelRequestedAt: Date | null;
	commands: readonly CancelAlertCommandView[];
	now?: Date;
}): CancelAlertView {
	const latest = latestCancelAlertCommand(incidentId, commands);
	const base = {
		commandId: latest?.id ?? null,
		requestedAt: latest?.createdAt ?? cancelRequestedAt,
	};

	if (status === "FALSE_ALARM") {
		const confirmed =
			latest?.status === "ACKED" && readCancelAckDetail(latest.payload) === "cancelled";
		// Without a confirmation the incident was closed some other way; do not
		// imply the tracker was involved.
		return confirmed
			? { state: "confirmed", detail: "cancelled", ...base }
			: { state: "idle", detail: null, commandId: null, requestedAt: null };
	}

	// RESOLVED is closed by the operator. A late tracker confirmation is audit
	// data, not a pending request, so the banner stays out of the way.
	if (status === "RESOLVED") {
		return { state: "idle", detail: null, commandId: null, requestedAt: null };
	}

	if (!latest) {
		return {
			state: cancelRequestedAt ? "waiting" : "idle",
			detail: null,
			...base,
		};
	}

	switch (latest.status) {
		case "PENDING":
			if (latest.expiresAt && latest.expiresAt.getTime() <= now.getTime()) {
				// The tracker never collected the command. Nothing was confirmed.
				return { state: "not_confirmed", detail: "expired", ...base };
			}
			return { state: "waiting", detail: null, ...base };
		case "EXPIRED":
			return { state: "not_confirmed", detail: "expired", ...base };
		case "FAILED":
			return {
				state: "failed",
				detail: readCancelAckDetail(latest.payload) ?? "failed",
				...base,
			};
		default: {
			const detail = readCancelAckDetail(latest.payload);
			if (detail === "cancelled") return { state: "confirmed", detail, ...base };
			if (detail === "too_late" || detail === "unknown_incident") {
				return { state: "not_confirmed", detail, ...base };
			}
			return { state: "not_confirmed", detail: detail ?? "unconfirmed", ...base };
		}
	}
}

export interface CancelAlertCopy {
	title: string;
	body: string;
}

/** Translation keys for the incident banner; null means there is nothing to say. */
export function cancelAlertCopyKey(view: {
	state: CancelAlertStateName;
	detail: string | null;
}): CancelAlertCopy | null {
	if (view.state === "waiting") {
		return { title: "cancelWaitingTitle", body: "cancelWaitingBody" };
	}
	if (view.state === "failed") {
		return { title: "cancelNotConfirmedTitle", body: "cancelFailedBody" };
	}
	if (view.state === "not_confirmed") {
		if (view.detail === "too_late") {
			return { title: "cancelNotConfirmedTitle", body: "cancelTooLateBody" };
		}
		if (view.detail === "unknown_incident") {
			return { title: "cancelNotConfirmedTitle", body: "cancelUnknownIncidentBody" };
		}
		if (view.detail === "expired") {
			return { title: "cancelNotConfirmedTitle", body: "cancelExpiredBody" };
		}
		return { title: "cancelNotConfirmedTitle", body: "cancelNotConfirmedBody" };
	}
	return null;
}
