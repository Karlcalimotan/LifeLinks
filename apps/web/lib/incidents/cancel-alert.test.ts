import { canTransition } from "@/lib/incidents/state";
import { describe, expect, it } from "vitest";
import {
	CANCEL_ACK_DETAILS,
	CANCEL_ALERT_RESOLUTION,
	type CancelAlertCommandView,
	buildCancelAlertPayload,
	canCloseCancelAlert,
	canRequestCancelAlert,
	cancelAlertCopyKey,
	classifyCancelAck,
	latestCancelAlertCommand,
	readCancelAlertIncidentId,
	readCancelAlertState,
} from "./cancel-alert";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 23, 8, minutes));

function command(overrides: Partial<CancelAlertCommandView> = {}): CancelAlertCommandView {
	return {
		id: "cmd-1",
		kind: "CANCEL_ALERT",
		status: "PENDING",
		payload: { incident_id: "inc-1", reason: "false_alarm", all_clear: true },
		createdAt: at(1),
		...overrides,
	};
}

describe("buildCancelAlertPayload", () => {
	it("builds the exact frozen contract payload", () => {
		expect(buildCancelAlertPayload("inc-1")).toEqual({
			incident_id: "inc-1",
			reason: "false_alarm",
			all_clear: true,
		});
	});

	it("does not carry operator-supplied fields into the device payload", () => {
		const payload = buildCancelAlertPayload("inc-2");
		expect(Object.keys(payload).sort()).toEqual(["all_clear", "incident_id", "reason"]);
	});
});

describe("status eligibility", () => {
	it("allows a request while the tracker may still be alerting", () => {
		expect(canRequestCancelAlert("SUSPECTED")).toBe(true);
		expect(canRequestCancelAlert("CONFIRMED")).toBe(true);
		expect(canRequestCancelAlert("ACKNOWLEDGED")).toBe(true);
	});

	it("does not ask a tracker that already stopped or is closed", () => {
		expect(canRequestCancelAlert("CANCELLED")).toBe(false);
		expect(canRequestCancelAlert("RESOLVED")).toBe(false);
		expect(canRequestCancelAlert("FALSE_ALARM")).toBe(false);
	});

	it("lets a confirmation close every non-terminal status, including a raced cancel", () => {
		expect(canCloseCancelAlert("SUSPECTED")).toBe(true);
		expect(canCloseCancelAlert("CONFIRMED")).toBe(true);
		expect(canCloseCancelAlert("ACKNOWLEDGED")).toBe(true);
		expect(canCloseCancelAlert("CANCELLED")).toBe(true);
		expect(canCloseCancelAlert("RESOLVED")).toBe(false);
		expect(canCloseCancelAlert("FALSE_ALARM")).toBe(false);
	});

	it("matches the incident state machine for every status", () => {
		for (const status of [
			"SUSPECTED",
			"CONFIRMED",
			"ACKNOWLEDGED",
			"CANCELLED",
			"RESOLVED",
			"FALSE_ALARM",
		] as const) {
			expect(canCloseCancelAlert(status)).toBe(canTransition(status, "FALSE_ALARM"));
		}
	});
});

describe("classifyCancelAck", () => {
	it("lists the three frozen ACK details", () => {
		expect(CANCEL_ACK_DETAILS).toEqual(["cancelled", "too_late", "unknown_incident"]);
	});

	it("maps the three contract details", () => {
		expect(classifyCancelAck({ status: "ACKED", detail: "cancelled" })).toBe("cancelled");
		expect(classifyCancelAck({ status: "ACKED", detail: "too_late" })).toBe("too_late");
		expect(classifyCancelAck({ status: "ACKED", detail: "unknown_incident" })).toBe(
			"unknown_incident",
		);
	});

	it("does not treat a generic ACK as a cancellation", () => {
		expect(classifyCancelAck({ status: "ACKED", detail: null })).toBe("unconfirmed");
		expect(classifyCancelAck({ status: "ACKED", detail: "" })).toBe("unconfirmed");
		expect(classifyCancelAck({ status: "ACKED" })).toBe("unconfirmed");
		expect(classifyCancelAck({ status: "ACKED", detail: "done" })).toBe("unconfirmed");
	});

	it("reports a failed command as failed even with a cancellation detail", () => {
		expect(classifyCancelAck({ status: "FAILED", detail: "cancelled" })).toBe("failed");
	});
});

describe("payload readers", () => {
	it("reads the incident id and ack detail", () => {
		expect(readCancelAlertIncidentId({ incident_id: "inc-1" })).toBe("inc-1");
		expect(readCancelAlertIncidentId({ incident_id: "" })).toBeNull();
		expect(readCancelAlertIncidentId({ incident_id: 4 })).toBeNull();
		expect(readCancelAlertIncidentId(null)).toBeNull();
	});

	it("picks the newest command for the incident only", () => {
		const latest = latestCancelAlertCommand("inc-1", [
			command({ id: "old", createdAt: at(1) }),
			command({ id: "other-incident", payload: { incident_id: "inc-2" }, createdAt: at(9) }),
			command({ id: "new", status: "ACKED", createdAt: at(5) }),
			command({ id: "other-kind", kind: "LOCATE", createdAt: at(10) }),
		]);
		expect(latest?.id).toBe("new");
	});
});

describe("readCancelAlertState", () => {
	it("is idle before the operator asks", () => {
		expect(
			readCancelAlertState({
				incidentId: "inc-1",
				status: "CONFIRMED",
				cancelRequestedAt: null,
				commands: [],
			}),
		).toEqual({ state: "idle", detail: null, commandId: null, requestedAt: null });
	});

	it("waits while the command is pending and keeps the incident status untouched", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			cancelRequestedAt: at(1),
			commands: [command()],
		});
		expect(view.state).toBe("waiting");
		expect(view.commandId).toBe("cmd-1");
		expect(view.requestedAt).toEqual(at(1));
	});

	it("waits when the request was recorded but the command is not visible yet", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			cancelRequestedAt: at(1),
			commands: [],
		});
		expect(view.state).toBe("waiting");
	});

	it("reports the tracker's confirmation honestly", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "FALSE_ALARM",
			cancelRequestedAt: at(1),
			commands: [
				command({
					status: "ACKED",
					payload: {
						incident_id: "inc-1",
						reason: "false_alarm",
						all_clear: true,
						ackDetail: "cancelled",
					},
				}),
			],
		});
		expect(view.state).toBe("confirmed");
		expect(view.detail).toBe("cancelled");
	});

	it.each(["too_late", "unknown_incident"])(
		"keeps a failed confirmation visible for %s",
		(detail) => {
			const view = readCancelAlertState({
				incidentId: "inc-1",
				status: "CONFIRMED",
				cancelRequestedAt: at(1),
				commands: [
					command({
						status: "ACKED",
						payload: { incident_id: "inc-1", ackDetail: detail },
					}),
				],
			});
			expect(view.state).toBe("not_confirmed");
			expect(view.detail).toBe(detail);
		},
	);

	it("reports a failed command", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			cancelRequestedAt: at(1),
			commands: [
				command({
					status: "FAILED",
					payload: { incident_id: "inc-1", ackDetail: "modem_fault" },
				}),
			],
		});
		expect(view.state).toBe("failed");
		expect(view.detail).toBe("modem_fault");
	});

	it("reports an expired command as not confirmed", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			cancelRequestedAt: at(1),
			commands: [command({ status: "EXPIRED" })],
		});
		expect(view.state).toBe("not_confirmed");
		expect(view.detail).toBe("expired");
	});

	it("does not claim confirmation from a generic ACK", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			cancelRequestedAt: at(1),
			commands: [command({ status: "ACKED", payload: { incident_id: "inc-1" } })],
		});
		expect(view.state).toBe("not_confirmed");
		expect(view.detail).toBe("unconfirmed");
	});

	it("does not invent tracker involvement for a direct false alarm", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "FALSE_ALARM",
			cancelRequestedAt: null,
			commands: [],
		});
		expect(view.state).toBe("idle");
	});

	it("keeps a resolved incident quiet even with a stale request", () => {
		const view = readCancelAlertState({
			incidentId: "inc-1",
			status: "RESOLVED",
			cancelRequestedAt: at(1),
			commands: [command()],
		});
		expect(view.state).toBe("idle");
		expect(view.commandId).toBeNull();
	});
});

describe("cancelAlertCopyKey", () => {
	it("shows the waiting banner with a clear promise", () => {
		expect(cancelAlertCopyKey({ state: "waiting", detail: null })).toEqual({
			title: "cancelWaitingTitle",
			body: "cancelWaitingBody",
		});
	});

	it.each([
		["too_late", "cancelTooLateBody"],
		["unknown_incident", "cancelUnknownIncidentBody"],
		["expired", "cancelExpiredBody"],
		["unconfirmed", "cancelNotConfirmedBody"],
	])("explains a %s failure", (detail, body) => {
		expect(cancelAlertCopyKey({ state: "not_confirmed", detail })).toEqual({
			title: "cancelNotConfirmedTitle",
			body,
		});
	});

	it("shows nothing when the tracker confirmed or nothing happened", () => {
		expect(cancelAlertCopyKey({ state: "confirmed", detail: "cancelled" })).toBeNull();
		expect(cancelAlertCopyKey({ state: "idle", detail: null })).toBeNull();
	});
});

describe("CANCEL_ALERT_RESOLUTION", () => {
	it("records the tracker as the source of the resolution", () => {
		expect(CANCEL_ALERT_RESOLUTION).toBe("False alarm confirmed by tracker");
	});
});
