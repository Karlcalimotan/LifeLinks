import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	auditCreate: vi.fn(),
	updateMany: vi.fn(),
	stateCreate: vi.fn(),
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
		impactEvent: { findUnique: mocks.findUnique },
		auditLog: { create: mocks.auditCreate },
		$transaction: mocks.transaction,
	},
}));

import { POST } from "./route";

const deviceId = "AA:BB:CC:DD:EE:01";

function incident(status: string, cancelDeadline: Date | null) {
	return {
		id: "impact-1",
		clientIncidentId: "client-1",
		status,
		cancelDeadline,
	};
}

function request() {
	return new Request("http://localhost/api/device/incident/cancel", {
		method: "POST",
		headers: { "content-type": "application/json", "x-device-token": "test-token" },
		body: JSON.stringify({
			device_id: deviceId,
			incident_id: "client-1",
			cancelled_at: Math.floor(Date.now() / 1000),
		}),
	});
}

describe("POST /api/device/incident/cancel", () => {
	beforeEach(() => {
		mocks.findUnique.mockReset();
		mocks.auditCreate.mockReset();
		mocks.updateMany.mockReset();
		mocks.stateCreate.mockReset();
		mocks.transaction.mockReset();

		mocks.auditCreate.mockResolvedValue({});
		mocks.updateMany.mockResolvedValue({ count: 1 });
		mocks.stateCreate.mockResolvedValue({});
		mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				impactEvent: { updateMany: mocks.updateMany },
				deviceStateEvent: { create: mocks.stateCreate },
			}),
		);
	});

	it("cancels a confirmed incident inside the window", async () => {
		mocks.findUnique.mockResolvedValue(incident("CONFIRMED", new Date(Date.now() + 60_000)));
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ received: true, status: "CANCELLED", changed: true });
		expect(mocks.updateMany).toHaveBeenCalledOnce();
		expect(mocks.stateCreate).toHaveBeenCalledOnce();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("rejects a late cancel, keeps the status and records an audit note", async () => {
		mocks.findUnique.mockResolvedValue(incident("SUSPECTED", new Date(Date.now() - 31_000)));
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error.code).toBe("CONFLICT");
		expect(body.error.message).toBe("Cancel window has closed.");
		expect(mocks.updateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).toHaveBeenCalledOnce();
		expect(mocks.auditCreate.mock.calls[0]?.[0].data.action).toBe("device.cancel_rejected");
		expect(mocks.auditCreate.mock.calls[0]?.[0].data.metadata.reason).toBe("cancel_window_closed");
	});

	it("returns an idempotent success for an already cancelled incident", async () => {
		mocks.findUnique.mockResolvedValue(incident("CANCELLED", null));
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ received: true, status: "CANCELLED", changed: false });
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});

	it("does not change a terminal incident", async () => {
		mocks.findUnique.mockResolvedValue(incident("RESOLVED", null));
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ received: true, status: "RESOLVED", changed: false });
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});

	it("refuses an acknowledged incident and records why", async () => {
		mocks.findUnique.mockResolvedValue(incident("ACKNOWLEDGED", new Date(Date.now() + 60_000)));
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error.code).toBe("CONFLICT");
		expect(mocks.updateMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate.mock.calls[0]?.[0].data.metadata.reason).toBe(
			"incident_not_cancellable",
		);
	});

	it("returns 429 after the per-device cancel budget", async () => {
		mocks.findUnique.mockResolvedValue(incident("CANCELLED", null));
		for (let attempt = 0; attempt < 20; attempt += 1) {
			const response = await POST(request());
			expect(response.status).toBe(200);
		}

		const response = await POST(request());
		const body = await response.json();
		expect(response.status).toBe(429);
		expect(body.error.code).toBe("RATE_LIMITED");
	});
});
