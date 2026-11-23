import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireDevice: vi.fn(),
	getOrgSettings: vi.fn(),
	findUnique: vi.fn(),
	tripFindFirst: vi.fn(),
	transaction: vi.fn(),
	impactCreate: vi.fn(),
	alertCreateMany: vi.fn(),
	stateCreate: vi.fn(),
	notifyIncidentPush: vi.fn(),
	after: vi.fn(),
}));

vi.mock("next/server", () => ({
	after: mocks.after,
}));

vi.mock("@/lib/device/auth", () => ({
	requireDevice: mocks.requireDevice,
	isDeviceApproved: () => true,
}));

vi.mock("@/lib/settings/org", () => ({
	getOrgSettings: mocks.getOrgSettings,
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		impactEvent: { findUnique: mocks.findUnique },
		trip: { findFirst: mocks.tripFindFirst },
		$transaction: mocks.transaction,
	},
}));

vi.mock("@/lib/push/send", () => ({
	notifyIncidentPush: mocks.notifyIncidentPush,
}));

import { POST } from "./route";

const afterTasks: Array<() => Promise<void> | void> = [];

async function flushAfter(): Promise<void> {
	for (const task of afterTasks.splice(0)) await task();
}

function request(overrides: Record<string, unknown> = {}) {
	return new Request("http://localhost/api/device/incident", {
		method: "POST",
		headers: { "content-type": "application/json", "x-device-token": "test-token" },
		body: JSON.stringify({
			device_id: "AA:BB:CC:DD:EE:01",
			incident_id: "client-1",
			detected_at: 1_700_000_000,
			peak_accel_g: 3.2,
			tilt_deg: 70,
			vibration_count: 4,
			status: "CONFIRMED",
			...overrides,
		}),
	});
}

describe("POST /api/device/incident", () => {
	beforeEach(() => {
		mocks.requireDevice.mockReset();
		mocks.getOrgSettings.mockReset();
		mocks.findUnique.mockReset();
		mocks.tripFindFirst.mockReset();
		mocks.transaction.mockReset();
		mocks.impactCreate.mockReset();
		mocks.alertCreateMany.mockReset();
		mocks.stateCreate.mockReset();
		mocks.notifyIncidentPush.mockReset();
		mocks.after.mockReset();
		afterTasks.splice(0);
		mocks.after.mockImplementation((task: () => Promise<void> | void) => {
			afterTasks.push(task);
		});

		mocks.requireDevice.mockResolvedValue({
			id: "dev-1",
			mac: "AA:BB:CC:DD:EE:01",
			orgId: "org-1",
			vehicleId: "veh-1",
			approvalStatus: "APPROVED",
			lastLat: 10.7,
			lastLng: 122.5,
		});
		mocks.getOrgSettings.mockResolvedValue({
			orgId: "org-1",
			cancelWindowS: 15,
			alertPhones: ["+639171234567"],
			alertEmails: ["ops@example.com"],
		});
		mocks.findUnique.mockResolvedValue(null);
		mocks.tripFindFirst.mockResolvedValue(null);
		mocks.impactCreate.mockResolvedValue({ id: "inc-1", status: "CONFIRMED" });
		mocks.alertCreateMany.mockResolvedValue({ count: 2 });
		mocks.stateCreate.mockResolvedValue({});
		mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				impactEvent: { create: mocks.impactCreate },
				alertDelivery: { createMany: mocks.alertCreateMany },
				deviceStateEvent: { create: mocks.stateCreate },
			}),
		);
		mocks.notifyIncidentPush.mockResolvedValue({
			configured: true,
			targeted: 1,
			sent: 1,
			failed: 0,
			removed: 0,
		});
	});

	it("records the incident before scheduling the push", async () => {
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			received: true,
			incident_id: "inc-1",
			status: "CONFIRMED",
			duplicate: false,
			alerts_queued: 2,
		});

		// The response does not wait for delivery.
		expect(mocks.notifyIncidentPush).not.toHaveBeenCalled();
		expect(mocks.after).toHaveBeenCalledOnce();

		await flushAfter();

		expect(mocks.notifyIncidentPush).toHaveBeenCalledWith({
			orgId: "org-1",
			incidentId: "inc-1",
			vehicleId: "veh-1",
		});
		expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.notifyIncidentPush.mock.invocationCallOrder[0] as number,
		);
	});

	it("keeps the incident when the deferred push sender rejects", async () => {
		mocks.notifyIncidentPush.mockRejectedValue(new Error("push service down"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.incident_id).toBe("inc-1");

		await flushAfter();

		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does not notify for an incident cancelled at detection", async () => {
		mocks.impactCreate.mockResolvedValue({ id: "inc-2", status: "CANCELLED" });
		const response = await POST(request({ status: "CANCELLED" }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.status).toBe("CANCELLED");
		expect(afterTasks).toHaveLength(0);
		expect(mocks.notifyIncidentPush).not.toHaveBeenCalled();
	});

	it("does not notify twice for a retried incident", async () => {
		mocks.findUnique.mockResolvedValue({
			id: "inc-1",
			status: "CONFIRMED",
			lat: null,
			lng: null,
			gpsAgeS: null,
			evidence: {},
		});

		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({ duplicate: true, alerts_queued: 0 });
		expect(afterTasks).toHaveLength(0);
		expect(mocks.notifyIncidentPush).not.toHaveBeenCalled();
	});
});
