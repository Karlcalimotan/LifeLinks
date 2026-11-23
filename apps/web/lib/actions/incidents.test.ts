import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	incidentFindFirst: vi.fn(),
	incidentUpdateMany: vi.fn(),
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
			updateMany: mocks.incidentUpdateMany,
		},
		deviceCommand: { create: mocks.commandCreate },
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

import { requestCancelAlertAction } from "./incidents";

function form(
	values: {
		incidentId?: string;
		intent?: string;
		returnTo?: string;
		locale?: string;
	} = {},
): FormData {
	const data = new FormData();
	data.set("locale", values.locale ?? "en");
	data.set("incidentId", values.incidentId ?? "inc-1");
	if (values.intent) data.set("intent", values.intent);
	if (values.returnTo) data.set("returnTo", values.returnTo);
	return data;
}

function incident(overrides: Record<string, unknown> = {}) {
	return {
		id: "inc-1",
		orgId: "org-1",
		deviceId: "dev-1",
		status: "CONFIRMED",
		vehicle: { ownerId: "user-1" },
		...overrides,
	};
}

async function redirectOf(data: FormData): Promise<string> {
	try {
		await requestCancelAlertAction(data);
		throw new Error("expected a redirect");
	} catch (error) {
		if (!(error instanceof Error) || !error.message.startsWith("redirect:")) throw error;
		return error.message.slice("redirect:".length);
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({
		user: { id: "user-1" },
		org: { id: "org-1" },
		role: "ADMIN",
	});
	mocks.incidentFindFirst.mockResolvedValue(incident());
	mocks.incidentUpdateMany.mockResolvedValue({ count: 1 });
	mocks.commandCreate.mockResolvedValue({ id: "cmd-1" });
	mocks.auditCreate.mockResolvedValue({});
	mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
		fn({
			impactEvent: { updateMany: mocks.incidentUpdateMany },
			deviceCommand: { create: mocks.commandCreate },
			auditLog: { create: mocks.auditCreate },
		}),
	);
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
				kind: "CANCEL_ALERT",
				payload: {
					incident_id: "inc-1",
					reason: "false_alarm",
					all_clear: true,
				},
				expiresAt: expect.any(Date),
			},
		});
		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				orgId: "org-1",
				actorId: "user-1",
				action: "incident.false_alarm_requested",
				target: "inc-1",
				metadata: { from: "CONFIRMED", intent: "false_alarm", deviceId: "dev-1" },
			}),
		});
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

	it("sets an expiry on the command so a silent tracker leaves evidence", async () => {
		const before = Date.now();
		await redirectOf(form());

		for (const [call] of mocks.commandCreate.mock.calls) {
			const expiresAt = call.data.expiresAt as Date;
			expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1_000);
		}
	});

	it("keeps the cancel intent separate in the audit trail", async () => {
		await redirectOf(form({ intent: "cancel" }));

		expect(mocks.auditCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "incident.cancel_requested",
				metadata: { from: "CONFIRMED", intent: "cancel", deviceId: "dev-1" },
			}),
		});
		expect(mocks.commandCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				payload: { incident_id: "inc-1", reason: "false_alarm", all_clear: true },
			}),
		});
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
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});
		mocks.incidentFindFirst.mockResolvedValue(incident({ vehicle: { ownerId: "user-2" } }));

		const path = await redirectOf(form());

		expect(path).toBe("/en/incidents/inc-1?error=forbidden");
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("lets a USER request a cancel for their own vehicle", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});

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
