import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	incidentFindFirst: vi.fn(),
	incidentUpdate: vi.fn(),
	incidentUpdateMany: vi.fn(),
	commandFindFirst: vi.fn(),
	commandFindMany: vi.fn(),
	commandCreate: vi.fn(),
	auditCreate: vi.fn(),
	transaction: vi.fn(),
	requireUser: vi.fn(),
	revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		impactEvent: {
			findFirst: mocks.incidentFindFirst,
			update: mocks.incidentUpdate,
			updateMany: mocks.incidentUpdateMany,
		},
		deviceCommand: {
			findFirst: mocks.commandFindFirst,
			findMany: mocks.commandFindMany,
			create: mocks.commandCreate,
		},
		auditLog: { create: mocks.auditCreate },
		$transaction: mocks.transaction,
	},
}));

vi.mock("@/lib/auth/session", () => ({
	requireUser: mocks.requireUser,
}));

vi.mock("next/cache", () => ({
	revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`);
	},
}));

import { type PermissionKey, rolePermissionDefaults } from "@/lib/auth/permissions";
import type { MemberRoleName } from "@/lib/auth/roles";
import { MAX_RESOLUTION_LENGTH } from "@/lib/incidents/resolution";
import {
	acknowledgeIncidentAction,
	cancelIncidentAction,
	falseAlarmAction,
	requestCancelAlertAction,
	resolveIncidentAction,
	resolveWithoutTrackerAction,
} from "./incidents";

const CLIENT_INCIDENT_ID = "llk-1a2b3c4d-00001234";

function form(
	values: {
		incidentId?: string;
		intent?: string;
		returnTo?: string;
		locale?: string;
		confirm?: string;
		resolution?: string;
	} = {},
): FormData {
	const data = new FormData();
	data.set("locale", values.locale ?? "en");
	data.set("incidentId", values.incidentId ?? "inc-1");
	if (values.intent) data.set("intent", values.intent);
	if (values.returnTo) data.set("returnTo", values.returnTo);
	if (values.confirm) data.set("confirm", values.confirm);
	if (values.resolution) data.set("resolution", values.resolution);
	return data;
}

function incident(overrides: Record<string, unknown> = {}) {
	return {
		id: "inc-1",
		orgId: "org-1",
		deviceId: "dev-1",
		clientIncidentId: CLIENT_INCIDENT_ID,
		status: "CONFIRMED",
		resolution: null,
		resolvedAt: null,
		cancelledAt: null,
		vehicle: { ownerId: "user-1" },
		device: { id: "dev-1" },
		...overrides,
	};
}

async function catchRedirect(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
		throw new Error("expected a redirect");
	} catch (error) {
		if (!(error instanceof Error) || !error.message.startsWith("redirect:")) throw error;
		return error.message.slice("redirect:".length);
	}
}

function redirectOf(data: FormData): Promise<string> {
	return catchRedirect(() => requestCancelAlertAction(data));
}

/** The session shape after #11: the overlay is resolved on every request. */
function currentFor(role: MemberRoleName, overrides: Partial<Record<PermissionKey, boolean>> = {}) {
	return {
		user: { id: "user-1" },
		org: { id: "org-1" },
		role,
		permissions: { ...rolePermissionDefaults(role), ...overrides },
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue(currentFor("ADMIN"));
	mocks.incidentFindFirst.mockResolvedValue(incident());
	mocks.incidentUpdate.mockResolvedValue({});
	mocks.incidentUpdateMany.mockResolvedValue({ count: 1 });
	mocks.commandFindFirst.mockResolvedValue(null);
	mocks.commandFindMany.mockResolvedValue([]);
	mocks.commandCreate.mockResolvedValue({ id: "cmd-1" });
	mocks.auditCreate.mockResolvedValue({});
	mocks.transaction.mockImplementation(async (arg: unknown) => {
		if (typeof arg === "function") {
			return (arg as (tx: unknown) => Promise<unknown>)({
				impactEvent: { updateMany: mocks.incidentUpdateMany },
				deviceCommand: {
					findFirst: mocks.commandFindFirst,
					create: mocks.commandCreate,
				},
				auditLog: { create: mocks.auditCreate },
			});
		}
		return Promise.all(arg as Promise<unknown>[]);
	});
});

describe("requestCancelAlertAction", () => {
	it("queues the exact CANCEL_ALERT payload and records the request", async () => {
		const path = await redirectOf(form({ intent: "false_alarm" }));

		expect(path).toBe("/en/incidents/inc-1?cancel=requested");
		expect(mocks.incidentUpdateMany).toHaveBeenCalledWith({
			where: {
				id: "inc-1",
				orgId: "org-1",
				status: { in: ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED"] },
			},
			data: { cancelRequestedAt: expect.any(Date) },
		});
		expect(mocks.commandCreate).toHaveBeenCalledWith({
			data: {
				deviceId: "dev-1",
				impactEventId: "inc-1",
				kind: "CANCEL_ALERT",
				payload: {
					incident_id: CLIENT_INCIDENT_ID,
					reason: "false_alarm",
					all_clear: true,
				},
				createdAt: expect.any(Date),
				expiresAt: expect.any(Date),
			},
		});
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				orgId: "org-1",
				actorId: "user-1",
				action: "incident.false_alarm_requested",
				target: "inc-1",
				metadata: {
					from: "CONFIRMED",
					intent: "false_alarm",
					deviceId: "dev-1",
					clientIncidentId: CLIENT_INCIDENT_ID,
				},
			}),
		});
	});

	it("sends the device client incident id, not the server id", async () => {
		await redirectOf(form({ intent: "false_alarm" }));

		const [call] = mocks.commandCreate.mock.calls;
		expect(call?.[0].data.payload.incident_id).toBe(CLIENT_INCIDENT_ID);
		expect(call?.[0].data.payload.incident_id).not.toBe("inc-1");
		expect(call?.[0].data.impactEventId).toBe("inc-1");
	});

	it("does not mark the incident FALSE_ALARM optimistically", async () => {
		await redirectOf(form({ intent: "false_alarm" }));

		for (const [call] of mocks.incidentUpdateMany.mock.calls) {
			expect(call.data).toEqual({ cancelRequestedAt: expect.any(Date) });
			expect(call.data).not.toHaveProperty("status");
			expect(call.data).not.toHaveProperty("resolution");
			expect(call.data).not.toHaveProperty("resolvedAt");
		}
		for (const [call] of mocks.commandCreate.mock.calls) {
			expect(call.data).not.toHaveProperty("status");
		}
	});

	it("sets an expiry and a matching request time on the command", async () => {
		const before = Date.now();
		await redirectOf(form());

		const claim = mocks.incidentUpdateMany.mock.calls[0]?.[0];
		const [create] = mocks.commandCreate.mock.calls;
		const expiresAt = create?.[0].data.expiresAt as Date;
		expect(create?.[0].data.createdAt).toEqual(claim?.data.cancelRequestedAt);
		expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1_000);
	});

	it("keeps the cancel intent separate in the audit trail", async () => {
		await redirectOf(form({ intent: "cancel" }));

		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.cancel_requested",
				metadata: {
					from: "CONFIRMED",
					intent: "cancel",
					deviceId: "dev-1",
					clientIncidentId: CLIENT_INCIDENT_ID,
				},
			}),
		});
		expect(mocks.commandCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				payload: { incident_id: CLIENT_INCIDENT_ID, reason: "false_alarm", all_clear: true },
			}),
		});
	});

	it("keeps a second submit from queueing a duplicate command", async () => {
		mocks.commandFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "cmd-live" });

		const path = await redirectOf(form({ intent: "false_alarm" }));

		expect(path).toBe("/en/incidents/inc-1?cancel=requested");
		expect(mocks.commandFindFirst).toHaveBeenCalledWith({
			where: {
				impactEventId: "inc-1",
				kind: "CANCEL_ALERT",
				status: "PENDING",
				OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
			},
			select: { id: true },
		});
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("allows a new request when the previous command is past its expiry", async () => {
		// The query excludes an expired PENDING command, so the action sees no
		// live command and queues a fresh one.
		mocks.commandFindFirst.mockResolvedValue(null);

		await redirectOf(form());

		expect(mocks.commandCreate).toHaveBeenCalledOnce();
		const [create] = mocks.commandCreate.mock.calls;
		const expiresAt = create?.[0].data.expiresAt as Date;
		expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("refuses to send a stand-down while an acknowledgement is pending", async () => {
		mocks.commandFindFirst.mockResolvedValueOnce({ id: "cmd-ack" });

		const path = await redirectOf(form({ intent: "false_alarm" }));

		expect(path).toBe("/en/incidents/inc-1?error=command_conflict");
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("returns to the board when the operator came from there", async () => {
		const path = await redirectOf(
			form({ returnTo: "/incidents?status=CONFIRMED", intent: "false_alarm" }),
		);

		expect(path).toBe("/en/incidents?status=CONFIRMED&cancel=requested");
	});

	it("requires the incident to be in the current organization", async () => {
		mocks.incidentFindFirst.mockResolvedValue(null);

		const path = await redirectOf(form());

		expect(path).toBe("/en/incidents?error=notfound");
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("keeps the vehicle-owner scope for USER members", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("USER"));
		mocks.incidentFindFirst.mockResolvedValue(incident({ vehicle: { ownerId: "user-2" } }));

		const path = await redirectOf(form());

		expect(path).toBe("/en/incidents/inc-1?error=forbidden");
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("lets a USER request a cancel for their own vehicle", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("USER"));

		const path = await redirectOf(form());

		expect(path).toBe("/en/incidents/inc-1?cancel=requested");
		expect(mocks.commandCreate).toHaveBeenCalledOnce();
	});

	it.each(["RESOLVED", "FALSE_ALARM", "CANCELLED"])(
		"refuses a %s incident without a command",
		async (status) => {
			mocks.incidentFindFirst.mockResolvedValue(incident({ status }));

			const path = await redirectOf(form());

			expect(path).toBe("/en/incidents/inc-1?error=transition");
			expect(mocks.transaction).not.toHaveBeenCalled();
			expect(mocks.commandCreate).not.toHaveBeenCalled();
		},
	);

	it("does not queue a command when a concurrent operator closed the incident", async () => {
		mocks.incidentUpdateMany.mockResolvedValue({ count: 0 });

		const path = await redirectOf(form());

		expect(path).toBe("/en/incidents/inc-1?error=transition");
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});
});

describe("legacy local transitions", () => {
	it.each([
		["false alarm", falseAlarmAction, "CONFIRMED"],
		["false alarm", falseAlarmAction, "ACKNOWLEDGED"],
		["cancel", cancelIncidentAction, "CONFIRMED"],
		["cancel", cancelIncidentAction, "ACKNOWLEDGED"],
	])(
		"refuses a local %s on a %s incident that needs the tracker",
		async (_label, action, status) => {
			mocks.incidentFindFirst.mockResolvedValue(incident({ status }));

			const path = await catchRedirect(() => action(form()));

			expect(path).toBe("/en/incidents/inc-1?error=tracker_required");
			expect(mocks.incidentUpdate).not.toHaveBeenCalled();
			expect(mocks.auditCreate).not.toHaveBeenCalled();
		},
	);

	it("keeps the CANCELLED to FALSE_ALARM local path", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ status: "CANCELLED" }));

		const path = await catchRedirect(() => falseAlarmAction(form()));

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.incidentUpdate).toHaveBeenCalledWith({
			where: { id: "inc-1" },
			data: expect.objectContaining({ status: "FALSE_ALARM", resolution: "False alarm" }),
		});
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.false_alarm",
				target: "inc-1",
				metadata: { from: "CANCELLED", to: "FALSE_ALARM" },
			}),
		});
	});
});

describe("acknowledgeIncidentAction", () => {
	function ackRedirect(data: FormData): Promise<string> {
		return catchRedirect(() => acknowledgeIncidentAction(data));
	}

	it.each(["RESPONDER", "ADMIN"] as const)(
		"lets a %s acknowledge a dispatched incident",
		async (role) => {
			mocks.requireUser.mockResolvedValue(currentFor(role));

			const path = await ackRedirect(form());

			expect(path).toBe("/en/incidents/inc-1?ack=requested");
			expect(mocks.commandCreate).toHaveBeenCalledOnce();
		},
	);

	it("denies a USER even for their own vehicle", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("USER"));

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?error=forbidden");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.commandCreate).not.toHaveBeenCalled();
	});

	it("queues the exact ACK_INCIDENT payload and records the request", async () => {
		await ackRedirect(form());

		expect(mocks.incidentUpdateMany).toHaveBeenCalledWith({
			where: {
				id: "inc-1",
				orgId: "org-1",
				status: "CONFIRMED",
				resolution: null,
			},
			data: { ackRequestedAt: expect.any(Date) },
		});
		expect(mocks.commandCreate).toHaveBeenCalledWith({
			data: {
				deviceId: "dev-1",
				impactEventId: "inc-1",
				kind: "ACK_INCIDENT",
				payload: { incident_id: CLIENT_INCIDENT_ID },
				createdAt: expect.any(Date),
				expiresAt: expect.any(Date),
			},
		});
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				orgId: "org-1",
				actorId: "user-1",
				action: "incident.ack_requested",
				target: "inc-1",
				metadata: {
					from: "CONFIRMED",
					deviceId: "dev-1",
					clientIncidentId: CLIENT_INCIDENT_ID,
				},
			}),
		});
	});

	it("sends the device client incident id, not the server id", async () => {
		await ackRedirect(form());

		const [call] = mocks.commandCreate.mock.calls;
		expect(call?.[0].data.payload.incident_id).toBe(CLIENT_INCIDENT_ID);
		expect(call?.[0].data.payload.incident_id).not.toBe("inc-1");
		expect(call?.[0].data.impactEventId).toBe("inc-1");
	});

	it("does not mark the incident ACKNOWLEDGED optimistically", async () => {
		await ackRedirect(form());

		for (const [call] of mocks.incidentUpdateMany.mock.calls) {
			expect(call.data).toEqual({ ackRequestedAt: expect.any(Date) });
			expect(call.data).not.toHaveProperty("status");
			expect(call.data).not.toHaveProperty("resolution");
			expect(call.data).not.toHaveProperty("resolvedAt");
		}
		for (const [call] of mocks.commandCreate.mock.calls) {
			expect(call.data).not.toHaveProperty("status");
		}
	});

	it("sets an expiry and a matching request time on the command", async () => {
		const before = Date.now();
		await ackRedirect(form());

		const claim = mocks.incidentUpdateMany.mock.calls[0]?.[0];
		const [create] = mocks.commandCreate.mock.calls;
		const expiresAt = create?.[0].data.expiresAt as Date;
		expect(create?.[0].data.createdAt).toEqual(claim?.data.ackRequestedAt);
		expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1_000);
	});

	it("keeps a second submit from queueing a duplicate command", async () => {
		mocks.commandFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "cmd-live" });

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?ack=requested");
		expect(mocks.commandFindFirst).toHaveBeenCalledWith({
			where: {
				impactEventId: "inc-1",
				kind: "ACK_INCIDENT",
				status: "PENDING",
				OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
			},
			select: { id: true },
		});
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("refuses to acknowledge while a stand-down command is pending", async () => {
		mocks.commandFindFirst.mockResolvedValueOnce({ id: "cmd-cancel" });

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?error=command_conflict");
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("allows a new request when the previous command is past its expiry", async () => {
		mocks.commandFindFirst.mockResolvedValue(null);

		await ackRedirect(form());

		expect(mocks.commandCreate).toHaveBeenCalledOnce();
		const [create] = mocks.commandCreate.mock.calls;
		const expiresAt = create?.[0].data.expiresAt as Date;
		expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("keeps the local acknowledgement path for an incident with no device", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ device: null }));

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.incidentUpdateMany).toHaveBeenCalledWith({
			where: {
				id: "inc-1",
				orgId: "org-1",
				status: { in: ["SUSPECTED", "CONFIRMED"] },
				resolution: null,
			},
			data: { status: "ACKNOWLEDGED", ackRequestedAt: null },
		});
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.acknowledged",
				metadata: expect.objectContaining({ source: "operator" }),
			}),
		});
		expect(mocks.commandCreate).not.toHaveBeenCalled();
	});

	it("keeps the local path before dispatch for an incident with no device", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ status: "SUSPECTED", device: null }));

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.incidentUpdateMany).toHaveBeenCalledWith({
			where: expect.objectContaining({ status: { in: ["SUSPECTED", "CONFIRMED"] } }),
			data: { status: "ACKNOWLEDGED", ackRequestedAt: null },
		});
	});

	it("refuses to acknowledge a device-backed incident before dispatch", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ status: "SUSPECTED" }));

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?error=ack_not_dispatched");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it.each(["RESOLVED", "FALSE_ALARM", "CANCELLED"])(
		"refuses a terminal %s incident without a command",
		async (status) => {
			mocks.incidentFindFirst.mockResolvedValue(incident({ status }));

			const path = await ackRedirect(form());

			expect(path).toBe("/en/incidents/inc-1?error=transition");
			expect(mocks.transaction).not.toHaveBeenCalled();
			expect(mocks.commandCreate).not.toHaveBeenCalled();
		},
	);

	it("does not queue a command when a concurrent operator closed the incident", async () => {
		mocks.incidentUpdateMany.mockResolvedValue({ count: 0 });

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?error=transition");
		expect(mocks.commandCreate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("requires the incident to be in the current organization", async () => {
		mocks.incidentFindFirst.mockResolvedValue(null);

		const path = await ackRedirect(form());

		expect(path).toBe("/en/incidents?error=notfound");
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
});

describe("resolve safety for a latched device incident", () => {
	function resolveRedirect(data: FormData): Promise<string> {
		return catchRedirect(() => resolveIncidentAction(data));
	}

	it("refuses to resolve a CONFIRMED device incident before acknowledgement", async () => {
		const path = await resolveRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?error=ack_required");
		expect(mocks.incidentUpdate).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("allows resolve once the tracker has acknowledged the incident", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ status: "ACKNOWLEDGED" }));

		const path = await resolveRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.incidentUpdate).toHaveBeenCalledWith({
			where: { id: "inc-1" },
			data: expect.objectContaining({ status: "RESOLVED" }),
		});
	});

	it("does not gate an incident with no device", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ device: null }));

		const path = await resolveRedirect(form());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.incidentUpdate).toHaveBeenCalledOnce();
	});

	it("bounds the resolution note", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ status: "ACKNOWLEDGED" }));

		const path = await resolveRedirect(
			form({ resolution: "x".repeat(MAX_RESOLUTION_LENGTH + 100) }),
		);

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		const [update] = mocks.incidentUpdate.mock.calls;
		expect(update?.[0].data.resolution).toHaveLength(MAX_RESOLUTION_LENGTH);
	});
});

describe("resolveWithoutTrackerAction", () => {
	const CLIENT_ID = CLIENT_INCIDENT_ID;

	function ackCommand(overrides: Record<string, unknown> = {}) {
		return {
			id: "cmd-ack-1",
			kind: "ACK_INCIDENT",
			status: "EXPIRED",
			payload: { incident_id: CLIENT_ID },
			impactEventId: "inc-1",
			createdAt: new Date(Date.now() - 20 * 60 * 1000),
			expiresAt: new Date(Date.now() - 10 * 60 * 1000),
			...overrides,
		};
	}

	function recoveryRedirect(data: FormData): Promise<string> {
		return catchRedirect(() => resolveWithoutTrackerAction(data));
	}

	function confirmedForm(values: Parameters<typeof form>[0] = {}): FormData {
		return form({ ...values, confirm: "RESOLVE" });
	}

	it("lets an ADMIN resolve a device incident after the ack command expired", async () => {
		mocks.commandFindMany.mockResolvedValue([ackCommand()]);

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.commandFindMany).toHaveBeenCalledWith({
			where: { impactEventId: "inc-1", kind: "ACK_INCIDENT" },
			orderBy: { createdAt: "desc" },
			take: 20,
			select: {
				id: true,
				kind: true,
				status: true,
				payload: true,
				impactEventId: true,
				createdAt: true,
				expiresAt: true,
			},
		});
		expect(mocks.incidentUpdateMany).toHaveBeenCalledWith({
			where: {
				id: "inc-1",
				orgId: "org-1",
				status: "CONFIRMED",
				resolution: null,
			},
			data: {
				status: "RESOLVED",
				resolution: "Resolved without tracker confirmation",
				resolvedAt: expect.any(Date),
				ackRequestedAt: null,
			},
		});
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				orgId: "org-1",
				actorId: "user-1",
				action: "incident.resolved_unconfirmed",
				target: "inc-1",
				metadata: expect.objectContaining({
					from: "CONFIRMED",
					to: "RESOLVED",
					source: "admin_recovery",
					ackState: "not_confirmed",
					ackDetail: "expired",
					lastCommandId: "cmd-ack-1",
					lastCommandStatus: "EXPIRED",
				}),
			}),
		});
	});

	it("lets an ADMIN resolve after a failed ack command", async () => {
		mocks.commandFindMany.mockResolvedValue([ackCommand({ status: "FAILED" })]);

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.resolved_unconfirmed",
				metadata: expect.objectContaining({ lastCommandStatus: "FAILED" }),
			}),
		});
	});

	it("lets an ADMIN resolve after the tracker answers unknown_incident", async () => {
		mocks.commandFindMany.mockResolvedValue([
			ackCommand({
				status: "ACKED",
				payload: { incident_id: CLIENT_ID, ackDetail: "unknown_incident" },
			}),
		]);

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.incidentUpdateMany).toHaveBeenCalledOnce();
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.resolved_unconfirmed",
				metadata: expect.objectContaining({
					ackState: "not_confirmed",
					ackDetail: "unknown_incident",
				}),
			}),
		});
	});

	it("lets an ADMIN resolve after an unconfirmed ACK", async () => {
		mocks.commandFindMany.mockResolvedValue([
			ackCommand({ status: "ACKED", payload: { incident_id: CLIENT_ID } }),
		]);

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		expect(mocks.incidentUpdateMany).toHaveBeenCalledOnce();
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.resolved_unconfirmed",
				metadata: expect.objectContaining({
					ackState: "not_confirmed",
					ackDetail: "unconfirmed",
				}),
			}),
		});
	});

	it("denies a RESPONDER", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("RESPONDER"));

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?error=forbidden");
		expect(mocks.commandFindMany).not.toHaveBeenCalled();
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
	});

	it("requires the typed confirmation on the server", async () => {
		mocks.commandFindMany.mockResolvedValue([ackCommand()]);

		const path = await recoveryRedirect(form({ confirm: "NOPE" }));

		expect(path).toBe("/en/incidents/inc-1?error=ack_confirmation_required");
		expect(mocks.incidentFindFirst).not.toHaveBeenCalled();
		expect(mocks.commandFindMany).not.toHaveBeenCalled();
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
	});

	it("is not offered while a fresh acknowledgement is pending", async () => {
		mocks.commandFindMany.mockResolvedValue([
			ackCommand({
				status: "PENDING",
				expiresAt: new Date(Date.now() + 10 * 60 * 1000),
			}),
		]);

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?error=ack_recovery_unavailable");
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("refuses an incident with no device", async () => {
		mocks.incidentFindFirst.mockResolvedValue(incident({ device: null }));

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?error=ack_recovery_unavailable");
		expect(mocks.commandFindMany).not.toHaveBeenCalled();
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
	});

	it("refuses an incident that was never acknowledged", async () => {
		mocks.commandFindMany.mockResolvedValue([]);

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?error=ack_recovery_unavailable");
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
	});

	it("does not overwrite a concurrent terminal transition", async () => {
		mocks.commandFindMany.mockResolvedValue([ackCommand()]);
		mocks.incidentUpdateMany.mockResolvedValue({ count: 0 });

		const path = await recoveryRedirect(confirmedForm());

		expect(path).toBe("/en/incidents/inc-1?error=transition");
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("bounds the resolution note", async () => {
		mocks.commandFindMany.mockResolvedValue([ackCommand()]);

		const path = await recoveryRedirect(
			confirmedForm({ resolution: "x".repeat(MAX_RESOLUTION_LENGTH + 100) }),
		);

		expect(path).toBe("/en/incidents/inc-1?updated=1");
		const [update] = mocks.incidentUpdateMany.mock.calls;
		expect(update?.[0].data.resolution).toHaveLength(MAX_RESOLUTION_LENGTH);
	});
});

describe("permission overlay", () => {
	it("refuses an acknowledge the membership override denies", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("RESPONDER", { "incident.acknowledge": false }));

		const path = await catchRedirect(() => acknowledgeIncidentAction(form()));

		expect(path).toBe("/en/incidents/inc-1?error=forbidden");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("lets an override grant acknowledgement to a USER", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("USER", { "incident.acknowledge": true }));

		const path = await catchRedirect(() => acknowledgeIncidentAction(form()));

		expect(path).toBe("/en/incidents/inc-1?ack=requested");
		expect(mocks.commandCreate).toHaveBeenCalledOnce();
	});

	it("refuses a resolve the membership override denies", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("RESPONDER", { "incident.resolve": false }));

		const path = await catchRedirect(() => resolveIncidentAction(form()));

		expect(path).toBe("/en/incidents/inc-1?error=forbidden");
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("refuses the admin recovery when the overlay denies resolve", async () => {
		mocks.requireUser.mockResolvedValue(currentFor("ADMIN", { "incident.resolve": false }));

		const path = await catchRedirect(() =>
			resolveWithoutTrackerAction(form({ confirm: "RESOLVE" })),
		);

		expect(path).toBe("/en/incidents/inc-1?error=forbidden");
		expect(mocks.commandFindMany).not.toHaveBeenCalled();
	});
});
