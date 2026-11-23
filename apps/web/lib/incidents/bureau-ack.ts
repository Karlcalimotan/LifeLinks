import type { ImpactStatusName } from "@/lib/incidents/state";

/**
 * Bureau acknowledgement for a dispatched incident. The tracker latches
 * `Alerting` until it receives `ACK_INCIDENT` for the active device client
 * incident id (`llk-...`), so the web must never set `ACKNOWLEDGED` on its own
 * for a device-backed dispatch. The contract is frozen in `docs/safety.md`;
 * `payload.incident_id` is the tracker's own id, and the command row keeps the
 * server `ImpactEvent.id` in `impactEventId`.
 */
export const ACK_INCIDENT_KIND = "ACK_INCIDENT" as const;

/** The tracker polls every few seconds; ten minutes matches the other commands. */
export const ACK_INCIDENT_COMMAND_TTL_MS = 10 * 60 * 1000;

export type AckIncidentDetail = "acknowledged" | "unknown_incident";

export const ACK_INCIDENT_DETAILS: readonly AckIncidentDetail[] = [
	"acknowledged",
	"unknown_incident",
];

/**
 * Statuses a device acknowledgement may move to `ACKNOWLEDGED`. Terminal
 * statuses are deliberately absent: a concurrent resolve or false alarm wins
 * and a late tracker reply must not resurrect the incident.
 */
export const ACK_INCIDENT_CONFIRMABLE_STATUSES = [
	"SUSPECTED",
	"CONFIRMED",
	"ACKNOWLEDGED",
] as const satisfies readonly ImpactStatusName[];

export type AckIncidentPayload = {
	incident_id: string;
};

/**
 * The exact payload frozen for `ACK_INCIDENT`. The id is the device client
 * incident id, because the firmware compares it with its own `g_incidentId`.
 */
export function buildAckIncidentPayload(clientIncidentId: string): AckIncidentPayload {
	return { incident_id: clientIncidentId };
}

/** Whether a device acknowledgement may confirm this status. */
export function canConfirmAckIncident(status: ImpactStatusName): boolean {
	return (ACK_INCIDENT_CONFIRMABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * A dispatched device alarm is latched until the tracker confirms the
 * acknowledgement. Resolving before that would tell the operator the alarm is
 * over while the buzzer is still running.
 */
export function acknowledgementRequiredBeforeResolve({
	status,
	deviceBacked,
}: {
	status: string;
	deviceBacked: boolean;
}): boolean {
	return deviceBacked && status === "CONFIRMED";
}

/** Stored when an admin closes an incident without a tracker confirmation. */
export const UNCONFIRMED_RESOLUTION = "Resolved without tracker confirmation";

/**
 * The ADMIN recovery path is deliberately narrow: only a dispatched device
 * incident whose acknowledgement command did not confirm the alarm. That
 * includes an expired or failed command, and a tracker that answered
 * `unknown_incident` or `unconfirmed` after a reboot or power loss. A fresh
 * PENDING command may still reach the tracker, and an acknowledged incident
 * uses the normal resolve path. A non-device incident has no tracker to wait
 * for.
 */
export function canResolveWithoutTracker({
	status,
	deviceBacked,
	ack,
}: {
	status: string;
	deviceBacked: boolean;
	ack: BureauAckView;
}): boolean {
	if (!deviceBacked || status !== "CONFIRMED") return false;
	if (ack.state === "failed") return true;
	if (ack.state !== "not_confirmed") return false;
	return (
		ack.detail === "expired" || ack.detail === "unknown_incident" || ack.detail === "unconfirmed"
	);
}

function payloadRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function readAckIncidentDetail(payload: unknown): string | null {
	const detail = payloadRecord(payload).ackDetail;
	return typeof detail === "string" && detail.length > 0 ? detail : null;
}

export type AckIncidentOutcome = "acknowledged" | "unknown_incident" | "unconfirmed" | "failed";

/**
 * Map a device acknowledgement to what actually happened. Anything that is not
 * one of the two contract details is "unconfirmed", never "acknowledged": a
 * generic ACK from older firmware is not proof that the alarm stopped.
 */
export function classifyAckIncident({
	status,
	detail,
}: {
	status: string;
	detail?: string | null;
}): AckIncidentOutcome {
	if (status === "FAILED") return "failed";
	if (detail === "acknowledged" || detail === "unknown_incident") return detail;
	return "unconfirmed";
}

export interface AckIncidentCommandView {
	id: string;
	kind: string;
	status: string;
	payload: unknown;
	impactEventId: string | null;
	createdAt: Date;
	expiresAt: Date | null;
}

/** The newest ACK_INCIDENT command that belongs to this server incident. */
export function latestAckIncidentCommand(
	incidentId: string,
	commands: readonly AckIncidentCommandView[],
): AckIncidentCommandView | null {
	let latest: AckIncidentCommandView | null = null;
	for (const command of commands) {
		if (command.kind !== ACK_INCIDENT_KIND) continue;
		if (command.impactEventId !== incidentId) continue;
		if (!latest || command.createdAt.getTime() > latest.createdAt.getTime()) latest = command;
	}
	return latest;
}

export type BureauAckStateName = "idle" | "waiting" | "acknowledged" | "not_confirmed" | "failed";

export interface BureauAckView {
	state: BureauAckStateName;
	/**
	 * `device` or `local` for an acknowledged incident; `expired`,
	 * `unknown_incident`, `unconfirmed` or the device's own reason otherwise.
	 */
	detail: string | null;
	commandId: string | null;
	requestedAt: Date | null;
}

/**
 * What the incident detail should say about a bureau acknowledgement. The
 * status is the operator-visible truth; the command is the device-visible
 * truth. They are only merged when the tracker actually confirmed.
 *
 * `now` lets a PENDING command that outlived its expiry become "not confirmed".
 * Without it a tracker that never polls would leave the banner waiting forever.
 */
export function readBureauAckState({
	incidentId,
	status,
	ackRequestedAt,
	commands,
	now = new Date(),
}: {
	incidentId: string;
	status: string;
	ackRequestedAt: Date | null;
	commands: readonly AckIncidentCommandView[];
	now?: Date;
}): BureauAckView {
	const latest = latestAckIncidentCommand(incidentId, commands);
	const base = {
		commandId: latest?.id ?? null,
		requestedAt: latest?.createdAt ?? ackRequestedAt,
	};

	if (status === "ACKNOWLEDGED") {
		const confirmed =
			latest?.status === "ACKED" && readAckIncidentDetail(latest.payload) === "acknowledged";
		// A local acknowledgement before dispatch has no device confirmation to
		// claim; the copy says so instead of implying the tracker answered.
		return { state: "acknowledged", detail: confirmed ? "device" : "local", ...base };
	}

	// A terminal incident is closed by the operator or a false alarm. A late
	// tracker reply is audit data, not a pending request.
	if (status === "RESOLVED" || status === "FALSE_ALARM" || status === "CANCELLED") {
		return { state: "idle", detail: null, commandId: null, requestedAt: null };
	}

	if (!latest) {
		return {
			state: ackRequestedAt ? "waiting" : "idle",
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
				detail: readAckIncidentDetail(latest.payload) ?? "failed",
				...base,
			};
		default: {
			const detail = readAckIncidentDetail(latest.payload);
			if (detail === "acknowledged") {
				return { state: "acknowledged", detail: "device", ...base };
			}
			if (detail === "unknown_incident") {
				return { state: "not_confirmed", detail, ...base };
			}
			return { state: "not_confirmed", detail: detail ?? "unconfirmed", ...base };
		}
	}
}

export interface BureauAckCopy {
	title: string;
	body: string;
}

/** Translation keys for the acknowledgement banner; null means nothing to say. */
export function bureauAckCopyKey(view: {
	state: BureauAckStateName;
	detail: string | null;
}): BureauAckCopy | null {
	if (view.state === "waiting") {
		return { title: "ackWaitingTitle", body: "ackWaitingBody" };
	}
	if (view.state === "failed") {
		return { title: "ackNotConfirmedTitle", body: "ackFailedBody" };
	}
	if (view.state === "not_confirmed") {
		if (view.detail === "unknown_incident") {
			return { title: "ackNotConfirmedTitle", body: "ackUnknownIncidentBody" };
		}
		if (view.detail === "expired") {
			return { title: "ackNotConfirmedTitle", body: "ackExpiredBody" };
		}
		return { title: "ackNotConfirmedTitle", body: "ackUnconfirmedBody" };
	}
	if (view.state === "acknowledged") {
		return view.detail === "device"
			? { title: "ackAcknowledgedTitle", body: "ackAcknowledgedBody" }
			: { title: "ackAcknowledgedTitle", body: "ackAcknowledgedLocalBody" };
	}
	return null;
}
