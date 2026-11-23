/** Audit and device rows share one chronological timeline on incident detail. */
export interface IncidentAuditSource {
	id: string;
	action: string;
	createdAt: Date;
	actorName?: string | null;
}

export interface IncidentDeviceSource {
	id: string;
	type: string;
	createdAt: Date;
}

export type IncidentTimelineEntry =
	| {
			kind: "audit";
			key: string;
			at: Date;
			action: string;
			actorName: string | null;
	  }
	| {
			kind: "device";
			key: string;
			at: Date;
			type: string;
	  };

const AUDIT_LABEL_KEYS: Record<string, string> = {
	"incident.suspected": "timelineSuspected",
	"incident.confirmed": "timelineConfirmed",
	"incident.acknowledged": "timelineAcknowledged",
	"incident.resolved": "timelineResolved",
	"incident.false_alarm": "timelineFalseAlarm",
	"incident.cancelled": "timelineCancelled",
	"incident.cancel_requested": "timelineCancelRequested",
	"incident.false_alarm_requested": "timelineFalseAlarmRequested",
	"incident.cancel_unconfirmed": "timelineCancelUnconfirmed",
	"incident.cancel_ack_ignored": "timelineCancelIgnored",
	"incident.ack_requested": "timelineAckRequested",
	"incident.ack_unconfirmed": "timelineAckUnconfirmed",
	"incident.ack_ignored": "timelineAckIgnored",
	"incident.resolved_unconfirmed": "timelineResolvedUnconfirmed",
};

/** Message key for an audit action; unknown actions fall back to a neutral label. */
export function incidentAuditLabelKey(action: string): string {
	return AUDIT_LABEL_KEYS[action] ?? "timelineUnknown";
}

/**
 * Merge operator audit rows with device state events, oldest first. Timestamps
 * come from the database, so no ordering is invented here. Ties fall back to
 * the stable key to keep server and client output identical.
 */
export function mergeIncidentTimeline(
	audit: readonly IncidentAuditSource[],
	device: readonly IncidentDeviceSource[],
): IncidentTimelineEntry[] {
	const entries: IncidentTimelineEntry[] = [
		...audit.map(
			(row): IncidentTimelineEntry => ({
				kind: "audit",
				key: `audit-${row.id}`,
				at: row.createdAt,
				action: row.action,
				actorName: row.actorName ?? null,
			}),
		),
		...device.map(
			(row): IncidentTimelineEntry => ({
				kind: "device",
				key: `device-${row.id}`,
				at: row.createdAt,
				type: row.type,
			}),
		),
	];
	return entries.sort((a, b) => a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key));
}

/** True when the merged timeline already names a cancellation. */
export function timelineHasCancellation(entries: readonly IncidentTimelineEntry[]): boolean {
	return entries.some(
		(entry) =>
			(entry.kind === "audit" && entry.action === "incident.cancelled") ||
			(entry.kind === "device" && entry.type === "INCIDENT_CANCELLED"),
	);
}
