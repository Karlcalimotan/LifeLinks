import { describe, expect, it } from "vitest";
import {
	ACK_INCIDENT_DETAILS,
	type AckIncidentCommandView,
	UNCONFIRMED_RESOLUTION,
	acknowledgementRequiredBeforeResolve,
	buildAckIncidentPayload,
	bureauAckCopyKey,
	canConfirmAckIncident,
	canResolveWithoutTracker,
	classifyAckIncident,
	latestAckIncidentCommand,
	readBureauAckState,
} from "./bureau-ack";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 24, 8, minutes));
const now = at(20);

function command(overrides: Partial<AckIncidentCommandView> = {}): AckIncidentCommandView {
	return {
		id: "cmd-ack-1",
		kind: "ACK_INCIDENT",
		status: "PENDING",
		payload: { incident_id: "llk-1a2b3c4d-00001234" },
		impactEventId: "inc-1",
		createdAt: at(1),
		expiresAt: at(25),
		...overrides,
	};
}

describe("buildAckIncidentPayload", () => {
	it("builds the exact frozen contract payload", () => {
		expect(buildAckIncidentPayload("llk-1a2b3c4d-00001234")).toEqual({
			incident_id: "llk-1a2b3c4d-00001234",
		});
	});

	it("carries the device client incident id, not the server id", () => {
		const payload = buildAckIncidentPayload("llk-1a2b3c4d-00001234");
		expect(payload.incident_id.startsWith("llk-")).toBe(true);
		expect(payload.incident_id).not.toBe("inc-1");
	});

	it("does not carry operator-supplied fields into the device payload", () => {
		const payload = buildAckIncidentPayload("llk-ffffffff-00000001");
		expect(Object.keys(payload)).toEqual(["incident_id"]);
	});
});

describe("status eligibility", () => {
	it("confirms a device ACK without overwriting terminal statuses", () => {
		expect(canConfirmAckIncident("SUSPECTED")).toBe(true);
		expect(canConfirmAckIncident("CONFIRMED")).toBe(true);
		expect(canConfirmAckIncident("ACKNOWLEDGED")).toBe(true);
		expect(canConfirmAckIncident("CANCELLED")).toBe(false);
		expect(canConfirmAckIncident("RESOLVED")).toBe(false);
		expect(canConfirmAckIncident("FALSE_ALARM")).toBe(false);
	});
});

describe("acknowledgementRequiredBeforeResolve", () => {
	it("requires acknowledgement for a dispatched device incident", () => {
		expect(acknowledgementRequiredBeforeResolve({ status: "CONFIRMED", deviceBacked: true })).toBe(
			true,
		);
	});

	it("does not gate a local incident or an already acknowledged one", () => {
		expect(acknowledgementRequiredBeforeResolve({ status: "CONFIRMED", deviceBacked: false })).toBe(
			false,
		);
		expect(
			acknowledgementRequiredBeforeResolve({ status: "ACKNOWLEDGED", deviceBacked: true }),
		).toBe(false);
		expect(acknowledgementRequiredBeforeResolve({ status: "SUSPECTED", deviceBacked: true })).toBe(
			false,
		);
	});
});

describe("canResolveWithoutTracker", () => {
	const view = (overrides: Partial<ReturnType<typeof readBureauAckState>> = {}) => ({
		state: "not_confirmed" as const,
		detail: "expired",
		commandId: "cmd-ack-1",
		requestedAt: at(1),
		...overrides,
	});

	it("allows the recovery path only for a dispatched device incident", () => {
		expect(canResolveWithoutTracker({ status: "CONFIRMED", deviceBacked: true, ack: view() })).toBe(
			true,
		);
		expect(
			canResolveWithoutTracker({ status: "CONFIRMED", deviceBacked: false, ack: view() }),
		).toBe(false);
		expect(canResolveWithoutTracker({ status: "SUSPECTED", deviceBacked: true, ack: view() })).toBe(
			false,
		);
		expect(
			canResolveWithoutTracker({ status: "ACKNOWLEDGED", deviceBacked: true, ack: view() }),
		).toBe(false);
	});

	it("allows an expired command and a failed command", () => {
		expect(canResolveWithoutTracker({ status: "CONFIRMED", deviceBacked: true, ack: view() })).toBe(
			true,
		);
		expect(
			canResolveWithoutTracker({
				status: "CONFIRMED",
				deviceBacked: true,
				ack: view({ state: "failed", detail: "modem_fault" }),
			}),
		).toBe(true);
	});

	it("does not offer the recovery path while a command is pending or acknowledged", () => {
		expect(
			canResolveWithoutTracker({
				status: "CONFIRMED",
				deviceBacked: true,
				ack: view({ state: "waiting", detail: null }),
			}),
		).toBe(false);
		expect(
			canResolveWithoutTracker({
				status: "CONFIRMED",
				deviceBacked: true,
				ack: view({ state: "acknowledged", detail: "device" }),
			}),
		).toBe(false);
		expect(
			canResolveWithoutTracker({
				status: "CONFIRMED",
				deviceBacked: true,
				ack: view({ state: "idle", detail: null }),
			}),
		).toBe(false);
	});

	it("allows a tracker that rebooted or could not confirm the incident", () => {
		expect(
			canResolveWithoutTracker({
				status: "CONFIRMED",
				deviceBacked: true,
				ack: view({ state: "not_confirmed", detail: "unknown_incident" }),
			}),
		).toBe(true);
		expect(
			canResolveWithoutTracker({
				status: "CONFIRMED",
				deviceBacked: true,
				ack: view({ state: "not_confirmed", detail: "unconfirmed" }),
			}),
		).toBe(true);
	});

	it("does not accept an arbitrary non-contract detail", () => {
		expect(
			canResolveWithoutTracker({
				status: "CONFIRMED",
				deviceBacked: true,
				ack: view({ state: "not_confirmed", detail: "done" }),
			}),
		).toBe(false);
	});
});

describe("UNCONFIRMED_RESOLUTION", () => {
	it("records that the tracker did not confirm", () => {
		expect(UNCONFIRMED_RESOLUTION).toBe("Resolved without tracker confirmation");
	});
});

describe("classifyAckIncident", () => {
	it("lists the two frozen ACK details", () => {
		expect(ACK_INCIDENT_DETAILS).toEqual(["acknowledged", "unknown_incident"]);
	});

	it("maps the two contract details", () => {
		expect(classifyAckIncident({ status: "ACKED", detail: "acknowledged" })).toBe("acknowledged");
		expect(classifyAckIncident({ status: "ACKED", detail: "unknown_incident" })).toBe(
			"unknown_incident",
		);
	});

	it("does not treat a generic ACK as an acknowledgement", () => {
		expect(classifyAckIncident({ status: "ACKED", detail: null })).toBe("unconfirmed");
		expect(classifyAckIncident({ status: "ACKED", detail: "" })).toBe("unconfirmed");
		expect(classifyAckIncident({ status: "ACKED" })).toBe("unconfirmed");
		expect(classifyAckIncident({ status: "ACKED", detail: "done" })).toBe("unconfirmed");
	});

	it("reports a failed command as failed even with an acknowledgement detail", () => {
		expect(classifyAckIncident({ status: "FAILED", detail: "acknowledged" })).toBe("failed");
	});
});

describe("latestAckIncidentCommand", () => {
	it("picks the newest ACK_INCIDENT for the server incident only", () => {
		const latest = latestAckIncidentCommand("inc-1", [
			command({ id: "old", createdAt: at(1) }),
			command({ id: "other-incident", impactEventId: "inc-2", createdAt: at(9) }),
			command({ id: "new", status: "ACKED", createdAt: at(5) }),
			command({ id: "other-kind", kind: "CANCEL_ALERT", createdAt: at(10) }),
		]);
		expect(latest?.id).toBe("new");
	});

	it("ignores a command that has no server incident link", () => {
		expect(
			latestAckIncidentCommand("inc-1", [command({ impactEventId: null, createdAt: at(9) })]),
		).toBeNull();
	});
});

describe("readBureauAckState", () => {
	it("is idle before the bureau asks", () => {
		expect(
			readBureauAckState({
				incidentId: "inc-1",
				status: "CONFIRMED",
				ackRequestedAt: null,
				commands: [],
				now,
			}),
		).toEqual({ state: "idle", detail: null, commandId: null, requestedAt: null });
	});

	it("waits while the command is pending and keeps the incident status untouched", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			ackRequestedAt: at(1),
			commands: [command()],
			now,
		});
		expect(view.state).toBe("waiting");
		expect(view.commandId).toBe("cmd-ack-1");
		expect(view.requestedAt).toEqual(at(1));
	});

	it("waits when the request was recorded but the command is not visible yet", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			ackRequestedAt: at(1),
			commands: [],
			now,
		});
		expect(view.state).toBe("waiting");
	});

	it("does not wait forever: a pending command past its expiry is not confirmed", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			ackRequestedAt: at(1),
			commands: [command({ status: "PENDING", expiresAt: at(5) })],
			now,
		});
		expect(view.state).toBe("not_confirmed");
		expect(view.detail).toBe("expired");
	});

	it("reports a command the platform marked EXPIRED as not confirmed", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			ackRequestedAt: at(1),
			commands: [command({ status: "EXPIRED" })],
			now,
		});
		expect(view.state).toBe("not_confirmed");
		expect(view.detail).toBe("expired");
	});

	it("reports a failed command without claiming the alarm stopped", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			ackRequestedAt: at(1),
			commands: [
				command({
					status: "FAILED",
					payload: { incident_id: "llk-1a2b3c4d-00001234", ackDetail: "modem_fault" },
				}),
			],
			now,
		});
		expect(view.state).toBe("failed");
		expect(view.detail).toBe("modem_fault");
	});

	it("reports the tracker's acknowledgement honestly", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "ACKNOWLEDGED",
			ackRequestedAt: at(1),
			commands: [
				command({
					status: "ACKED",
					payload: { incident_id: "llk-1a2b3c4d-00001234", ackDetail: "acknowledged" },
				}),
			],
			now,
		});
		expect(view.state).toBe("acknowledged");
		expect(view.detail).toBe("device");
	});

	it("distinguishes a local acknowledgement from a tracker confirmation", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "ACKNOWLEDGED",
			ackRequestedAt: null,
			commands: [],
			now,
		});
		expect(view.state).toBe("acknowledged");
		expect(view.detail).toBe("local");
	});

	it("keeps an unknown incident visible for a retry", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			ackRequestedAt: null,
			commands: [
				command({
					status: "ACKED",
					payload: { incident_id: "llk-1a2b3c4d-00001234", ackDetail: "unknown_incident" },
				}),
			],
			now,
		});
		expect(view.state).toBe("not_confirmed");
		expect(view.detail).toBe("unknown_incident");
	});

	it("does not claim confirmation from a generic ACK", () => {
		const view = readBureauAckState({
			incidentId: "inc-1",
			status: "CONFIRMED",
			ackRequestedAt: at(1),
			commands: [command({ status: "ACKED", payload: { incident_id: "llk-1a2b3c4d-00001234" } })],
			now,
		});
		expect(view.state).toBe("not_confirmed");
		expect(view.detail).toBe("unconfirmed");
	});

	it("keeps a terminal incident quiet even with a stale request", () => {
		for (const status of ["RESOLVED", "FALSE_ALARM", "CANCELLED"]) {
			const view = readBureauAckState({
				incidentId: "inc-1",
				status,
				ackRequestedAt: at(1),
				commands: [command()],
				now,
			});
			expect(view.state).toBe("idle");
			expect(view.commandId).toBeNull();
		}
	});
});

describe("bureauAckCopyKey", () => {
	it("shows the latched waiting banner with a clear promise", () => {
		expect(bureauAckCopyKey({ state: "waiting", detail: null })).toEqual({
			title: "ackWaitingTitle",
			body: "ackWaitingBody",
		});
	});

	it.each([
		["unknown_incident", "ackUnknownIncidentBody"],
		["expired", "ackExpiredBody"],
		["unconfirmed", "ackUnconfirmedBody"],
	])("explains a %s failure", (detail, body) => {
		expect(bureauAckCopyKey({ state: "not_confirmed", detail })).toEqual({
			title: "ackNotConfirmedTitle",
			body,
		});
	});

	it("explains a failed command", () => {
		expect(bureauAckCopyKey({ state: "failed", detail: "modem_fault" })).toEqual({
			title: "ackNotConfirmedTitle",
			body: "ackFailedBody",
		});
	});

	it("labels the acknowledged state and its source", () => {
		expect(bureauAckCopyKey({ state: "acknowledged", detail: "device" })).toEqual({
			title: "ackAcknowledgedTitle",
			body: "ackAcknowledgedBody",
		});
		expect(bureauAckCopyKey({ state: "acknowledged", detail: "local" })).toEqual({
			title: "ackAcknowledgedTitle",
			body: "ackAcknowledgedLocalBody",
		});
	});

	it("shows nothing when nothing happened", () => {
		expect(bureauAckCopyKey({ state: "idle", detail: null })).toBeNull();
	});
});
