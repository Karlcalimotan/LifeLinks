import { describe, expect, it } from "vitest";
import { incidentAuditLabelKey, mergeIncidentTimeline, timelineHasCancellation } from "./timeline";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 23, 8, minutes));

describe("incidentAuditLabelKey", () => {
	it.each([
		["incident.suspected", "timelineSuspected"],
		["incident.confirmed", "timelineConfirmed"],
		["incident.acknowledged", "timelineAcknowledged"],
		["incident.resolved", "timelineResolved"],
		["incident.false_alarm", "timelineFalseAlarm"],
		["incident.cancelled", "timelineCancelled"],
		["incident.cancel_requested", "timelineCancelRequested"],
		["incident.false_alarm_requested", "timelineFalseAlarmRequested"],
		["incident.cancel_unconfirmed", "timelineCancelUnconfirmed"],
		["incident.cancel_ack_ignored", "timelineCancelIgnored"],
	])("maps %s to %s", (action, key) => {
		expect(incidentAuditLabelKey(action)).toBe(key);
	});

	it("falls back for an action this build does not know", () => {
		expect(incidentAuditLabelKey("incident.reopened")).toBe("timelineUnknown");
	});
});

describe("mergeIncidentTimeline", () => {
	it("merges audit rows and device events oldest first", () => {
		const merged = mergeIncidentTimeline(
			[
				{
					id: "a2",
					action: "incident.acknowledged",
					createdAt: at(6),
					actorName: "Desk Officer",
				},
			],
			[
				{ id: "d1", type: "INCIDENT_CONFIRMED", createdAt: at(1) },
				{ id: "d2", type: "POWER_LOST", createdAt: at(12) },
			],
		);

		expect(merged.map((entry) => entry.key)).toEqual(["device-d1", "audit-a2", "device-d2"]);
		expect(merged[1]).toMatchObject({
			kind: "audit",
			action: "incident.acknowledged",
			actorName: "Desk Officer",
		});
	});

	it("keeps a null actor rather than inventing one", () => {
		const [entry] = mergeIncidentTimeline(
			[{ id: "a1", action: "incident.resolved", createdAt: at(3) }],
			[],
		);
		expect(entry).toMatchObject({ kind: "audit", actorName: null });
	});

	it("breaks timestamp ties deterministically", () => {
		const merged = mergeIncidentTimeline(
			[{ id: "a1", action: "incident.acknowledged", createdAt: at(4) }],
			[{ id: "d1", type: "HEARTBEAT", createdAt: at(4) }],
		);
		expect(merged.map((entry) => entry.key)).toEqual(["audit-a1", "device-d1"]);
	});

	it("returns an empty list when there is nothing to merge", () => {
		expect(mergeIncidentTimeline([], [])).toEqual([]);
	});
});

describe("timelineHasCancellation", () => {
	it("detects an operator cancellation", () => {
		const merged = mergeIncidentTimeline(
			[{ id: "a1", action: "incident.cancelled", createdAt: at(2) }],
			[],
		);
		expect(timelineHasCancellation(merged)).toBe(true);
	});

	it("detects a device cancellation", () => {
		const merged = mergeIncidentTimeline(
			[],
			[{ id: "d1", type: "INCIDENT_CANCELLED", createdAt: at(2) }],
		);
		expect(timelineHasCancellation(merged)).toBe(true);
	});

	it("is false when no cancellation is present", () => {
		const merged = mergeIncidentTimeline(
			[{ id: "a1", action: "incident.resolved", createdAt: at(2) }],
			[],
		);
		expect(timelineHasCancellation(merged)).toBe(false);
	});
});
