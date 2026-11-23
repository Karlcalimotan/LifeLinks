import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	commandFindFirst: vi.fn(),
	commandFindUnique: vi.fn(),
	commandUpdate: vi.fn(),
	commandUpdateMany: vi.fn(),
	incidentFindFirst: vi.fn(),
	incidentUpdateMany: vi.fn(),
	auditCreate: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("@/lib/device/auth", () => ({
	requireDevice: async () => ({
		id: "dev-1",
		mac: "AA:BB:CC:DD:EE:01",
		orgId: "org-1",
		approvalStatus: "APPROVED",
	}),
	isDeviceApproved: () => true,
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		deviceCommand: {
			findFirst: mocks.commandFindFirst,
			findUnique: mocks.commandFindUnique,
			update: mocks.commandUpdate,
			updateMany: mocks.commandUpdateMany,
		},
		impactEvent: {
			findFirst: mocks.incidentFindFirst,
			updateMany: mocks.incidentUpdateMany,
		},
		auditLog: { create: mocks.auditCreate },
		$transaction: mocks.transaction,
	},
}));

import { POST } from "./route";

const deviceId = "AA:BB:CC:DD:EE:01";

const cancelPayload = {
	incident_id: "inc-1",
	reason: "false_alarm",
	all_clear: true,
};

function command(overrides: Record<string, unknown> = {}) {
	return {
		id: "cmd-1",
		deviceId: "dev-1",
		kind: "CANCEL_ALERT",
		payload: cancelPayload,
		status: "PENDING",
		createdAt: new Date(),
		expiresAt: null,
		ackedAt: null,
		...overrides,
	};
}

function request({
	commandId = "cmd-1",
	status = "ACKED",
	detail,
	device = deviceId,
}: {
	commandId?: string;
	status?: string;
	detail?: string | null;
	device?: string;
} = {}) {
	return new Request("http://localhost/api/device/command/ack", {
		method: "POST",
		headers: { "content-type": "application/json", "x-device-token": "test-token" },
		body: JSON.stringify({
			device_id: device,
			command_id: commandId,
			status,
			...(detail === undefined ? {} : { detail }),
		}),
	});
}

describe("POST /api/device/command/ack", () => {
	beforeEach(() => {
		mocks.commandFindFirst.mockReset();
		mocks.commandFindUnique.mockReset();
		mocks.commandUpdate.mockReset();
		mocks.commandUpdateMany.mockReset();
		mocks.incidentFindFirst.mockReset();
		mocks.incidentUpdateMany.mockReset();
		mocks.auditCreate.mockReset();
		mocks.transaction.mockReset();

		mocks.commandFindFirst.mockResolvedValue(command());
		mocks.commandFindUnique.mockResolvedValue({ status: "ACKED" });
		mocks.commandUpdate.mockResolvedValue({ id: "cmd-1", status: "ACKED" });
		mocks.commandUpdateMany.mockResolvedValue({ count: 1 });
		mocks.incidentFindFirst.mockResolvedValue({ id: "inc-1", status: "CONFIRMED" });
		mocks.incidentUpdateMany.mockResolvedValue({ count: 1 });
		mocks.auditCreate.mockResolvedValue({});
		mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				deviceCommand: {
					updateMany: mocks.commandUpdateMany,
					findUnique: mocks.commandFindUnique,
				},
				impactEvent: {
					findFirst: mocks.incidentFindFirst,
					updateMany: mocks.incidentUpdateMany,
				},
				auditLog: { create: mocks.auditCreate },
			}),
		);
	});

	it("closes the incident as FALSE_ALARM only on cancelled", async () => {
		const response = await POST(request({ detail: "cancelled" }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			received: true,
			command_id: "cmd-1",
			status: "ACKED",
			result: "cancelled",
			incident_status: "FALSE_ALARM",
			duplicate: false,
			changed: true,
		});
		expect(mocks.incidentUpdateMany).toHaveBeenCalledWith({
			where: {
				id: "inc-1",
				orgId: "org-1",
				deviceId: "dev-1",
				status: { in: ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED", "CANCELLED"] },
			},
			data: expect.objectContaining({
				status: "FALSE_ALARM",
				resolution: "False alarm confirmed by tracker",
				resolvedAt: expect.any(Date),
			}),
		});
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.false_alarm",
				target: "inc-1",
				metadata: expect.objectContaining({
					source: "device_ack",
					commandId: "cmd-1",
					detail: "cancelled",
				}),
			}),
		});
	});

	it("records the ack detail on the command", async () => {
		await POST(request({ detail: "cancelled" }));

		expect(mocks.commandUpdateMany).toHaveBeenCalledWith({
			where: { id: "cmd-1", deviceId: "dev-1", status: { in: ["PENDING", "EXPIRED"] } },
			data: expect.objectContaining({
				status: "ACKED",
				ackedAt: expect.any(Date),
				payload: expect.objectContaining({
					incident_id: "inc-1",
					ackDetail: "cancelled",
				}),
			}),
		});
	});

	it("accepts a late confirmation for an expired command once", async () => {
		mocks.commandFindFirst.mockResolvedValue(command({ status: "EXPIRED" }));

		const response = await POST(request({ detail: "cancelled" }));
		const body = await response.json();

		expect(body.data.changed).toBe(true);
		expect(body.data.result).toBe("cancelled");
		expect(mocks.incidentUpdateMany).toHaveBeenCalledOnce();
	});

	it.each(["too_late", "unknown_incident"])(
		"keeps the status on %s and leaves a durable reason",
		async (detail) => {
			const response = await POST(request({ detail }));
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.data).toMatchObject({
				result: detail,
				incident_status: "CONFIRMED",
				changed: false,
			});
			expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
			expect(mocks.auditCreate).toHaveBeenCalledWith({
				data: expect.objectContaining({
					action: "incident.cancel_unconfirmed",
					target: "inc-1",
					metadata: expect.objectContaining({ result: detail, from: "CONFIRMED" }),
				}),
			});
		},
	);

	it("does not close on a generic ACK without a contract detail", async () => {
		const response = await POST(request());
		const body = await response.json();

		expect(body.data.result).toBe("unconfirmed");
		expect(body.data.changed).toBe(false);
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate.mock.calls[0]?.[0].data.action).toBe("incident.cancel_unconfirmed");
	});

	it("records a failed command without changing the incident", async () => {
		const response = await POST(request({ status: "FAILED", detail: "cancelled" }));
		const body = await response.json();

		expect(body.data.result).toBe("failed");
		expect(body.data.changed).toBe(false);
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
	});

	it("is idempotent: a repeated ACK does not touch the incident", async () => {
		mocks.commandUpdateMany.mockResolvedValue({ count: 0 });
		mocks.commandFindUnique.mockResolvedValue({ status: "ACKED" });
		mocks.commandFindFirst.mockResolvedValue(command({ status: "ACKED" }));

		const response = await POST(request({ detail: "cancelled" }));
		const body = await response.json();

		expect(body.data).toMatchObject({
			result: null,
			duplicate: true,
			changed: false,
			status: "ACKED",
		});
		expect(mocks.incidentFindFirst).not.toHaveBeenCalled();
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("does not close an incident that belongs to another device or org", async () => {
		mocks.incidentFindFirst.mockResolvedValue(null);

		const response = await POST(request({ detail: "cancelled" }));
		const body = await response.json();

		expect(mocks.incidentFindFirst).toHaveBeenCalledWith({
			where: { id: "inc-1", orgId: "org-1", deviceId: "dev-1" },
			select: { id: true, status: true },
		});
		expect(body.data.result).toBe("unknown_incident");
		expect(body.data.changed).toBe(false);
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.cancel_unconfirmed",
				metadata: expect.objectContaining({ reason: "incident_not_found_for_device" }),
			}),
		});
	});

	it("records a malformed CANCEL_ALERT without an incident id", async () => {
		mocks.commandFindFirst.mockResolvedValue(command({ payload: { reason: "false_alarm" } }));

		const response = await POST(request({ detail: "cancelled" }));
		const body = await response.json();

		expect(body.data.result).toBe("unconfirmed");
		expect(body.data.changed).toBe(false);
		expect(mocks.incidentFindFirst).not.toHaveBeenCalled();
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.cancel_unconfirmed",
				metadata: expect.objectContaining({ reason: "missing_incident_id" }),
			}),
		});
	});

	it("does not overwrite a terminal incident", async () => {
		mocks.incidentFindFirst.mockResolvedValue({ id: "inc-1", status: "RESOLVED" });

		const response = await POST(request({ detail: "cancelled" }));
		const body = await response.json();

		expect(body.data.result).toBe("already_closed");
		expect(body.data.incident_status).toBe("RESOLVED");
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.cancel_ack_ignored",
				metadata: expect.objectContaining({ result: "already_closed", from: "RESOLVED" }),
			}),
		});
	});

	it("refuses a command that belongs to another device", async () => {
		mocks.commandFindFirst.mockResolvedValue(null);

		const response = await POST(request({ detail: "cancelled" }));
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error.code).toBe("NOT_FOUND");
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
	});

	it("preserves the existing acknowledgement behaviour for other commands", async () => {
		mocks.commandFindFirst.mockResolvedValue(command({ kind: "LOCATE", payload: {} }));

		const response = await POST(request({ status: "ACKED", detail: undefined }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ received: true, command_id: "cmd-1", status: "ACKED" });
		expect(mocks.commandUpdate).toHaveBeenCalledOnce();
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
	});
});
