import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireDevice: vi.fn(),
	getOrgSettings: vi.fn(),
	overrideFindFirst: vi.fn(),
	findUnique: vi.fn(),
	tripFindFirst: vi.fn(),
	transaction: vi.fn(),
	impactCreate: vi.fn(),
	impactUpdate: vi.fn(),
	alertCount: vi.fn(),
	alertCreateMany: vi.fn(),
	stateCreate: vi.fn(),
	commandFindMany: vi.fn(),
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
	// Mirror of the pure mapping in lib/settings/org.ts; only the database read
	// is replaced, so getDeviceConfig still merges the real firmware fields.
	settingsToFirmwareValues: (settings: {
		impactThresholdG: number;
		tiltThresholdDeg: number;
		confirmWindowMs: number;
		cancelWindowS: number;
		heartbeatIntervalS: number;
		sosRetryS: number;
	}) => ({
		impactThresholdG: settings.impactThresholdG,
		tiltThresholdDeg: settings.tiltThresholdDeg,
		confirmWindowMs: settings.confirmWindowMs,
		cancelWindowS: settings.cancelWindowS,
		heartbeatIntervalS: settings.heartbeatIntervalS,
		sosRetryS: settings.sosRetryS,
	}),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		impactEvent: { findUnique: mocks.findUnique },
		trip: { findFirst: mocks.tripFindFirst },
		deviceConfigOverride: { findFirst: mocks.overrideFindFirst },
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
		mocks.overrideFindFirst.mockReset();
		mocks.findUnique.mockReset();
		mocks.tripFindFirst.mockReset();
		mocks.transaction.mockReset();
		mocks.impactCreate.mockReset();
		mocks.impactUpdate.mockReset();
		mocks.alertCount.mockReset();
		mocks.alertCreateMany.mockReset();
		mocks.stateCreate.mockReset();
		mocks.commandFindMany.mockReset();
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
			impactThresholdG: 2.5,
			tiltThresholdDeg: 60,
			confirmWindowMs: 200,
			cancelWindowS: 15,
			heartbeatIntervalS: 30,
			sosRetryS: 60,
			alertPhones: ["+639171234567"],
			alertEmails: ["ops@example.com"],
		});
		mocks.overrideFindFirst.mockResolvedValue(null);
		mocks.findUnique.mockResolvedValue(null);
		mocks.tripFindFirst.mockResolvedValue(null);
		mocks.impactCreate.mockResolvedValue({ id: "inc-1", status: "CONFIRMED" });
		mocks.impactUpdate.mockResolvedValue({ count: 1 });
		mocks.alertCount.mockResolvedValue(0);
		mocks.alertCreateMany.mockResolvedValue({ count: 2 });
		mocks.stateCreate.mockResolvedValue({});
		mocks.commandFindMany.mockResolvedValue([]);
		mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				impactEvent: { create: mocks.impactCreate, updateMany: mocks.impactUpdate },
				alertDelivery: { createMany: mocks.alertCreateMany, count: mocks.alertCount },
				deviceStateEvent: { create: mocks.stateCreate },
				deviceCommand: { findMany: mocks.commandFindMany },
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

	it("stays quiet for an initial suspected report", async () => {
		mocks.impactCreate.mockResolvedValue({ id: "inc-3", status: "SUSPECTED" });
		const response = await POST(request({ status: "SUSPECTED" }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.status).toBe("SUSPECTED");
		expect(afterTasks).toHaveLength(0);
		expect(mocks.notifyIncidentPush).not.toHaveBeenCalled();
	});

	it("notifies once when a suspected report is later confirmed", async () => {
		mocks.findUnique.mockResolvedValue({
			id: "inc-1",
			status: "SUSPECTED",
			lat: null,
			lng: null,
			gpsAgeS: null,
			evidence: {},
		});

		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({ incident_id: "inc-1", status: "CONFIRMED", duplicate: true });
		expect(mocks.impactUpdate).toHaveBeenCalledOnce();
		expect(afterTasks).toHaveLength(1);

		await flushAfter();

		expect(mocks.notifyIncidentPush).toHaveBeenCalledOnce();
		expect(mocks.notifyIncidentPush).toHaveBeenCalledWith({
			orgId: "org-1",
			incidentId: "inc-1",
			vehicleId: "veh-1",
		});
	});

	it("does not notify when another request already confirmed the incident", async () => {
		mocks.findUnique.mockResolvedValue({
			id: "inc-1",
			status: "SUSPECTED",
			lat: null,
			lng: null,
			gpsAgeS: null,
			evidence: {},
		});
		mocks.impactUpdate.mockResolvedValue({ count: 0 });

		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({ status: "CONFIRMED", duplicate: true, alerts_queued: 0 });
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

<<<<<<< HEAD
	it("uses the organisation cancel window when the tracker has no override", async () => {
		await POST(request());

		const created = mocks.impactCreate.mock.calls[0]?.[0]?.data as {
			detectedAt: Date;
			cancelDeadline: Date;
		};
		expect(created.cancelDeadline.getTime() - created.detectedAt.getTime()).toBe(15_000);
	});

	it("uses the per-device cancel window override for the deadline", async () => {
		mocks.overrideFindFirst.mockResolvedValue({
			impactThresholdG: null,
			tiltThresholdDeg: null,
			confirmWindowMs: null,
			cancelWindowS: 60,
			heartbeatIntervalS: null,
			sosRetryS: null,
		});

		await POST(request());

		const created = mocks.impactCreate.mock.calls[0]?.[0]?.data as {
			detectedAt: Date;
			cancelDeadline: Date;
		};
		expect(created.cancelDeadline.getTime() - created.detectedAt.getTime()).toBe(60_000);
		expect(mocks.overrideFindFirst).toHaveBeenCalledWith({
			where: { deviceId: "dev-1", orgId: "org-1" },
		});
	});

	it("reopens a legacy acknowledged incident when the tracker confirms the alarm", async () => {
		mocks.findUnique.mockResolvedValue({
			id: "inc-1",
			status: "ACKNOWLEDGED",
			lat: null,
			lng: null,
			gpsAgeS: null,
			evidence: {},
		});

		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			incident_id: "inc-1",
			status: "CONFIRMED",
			duplicate: true,
			alerts_queued: 2,
		});
		expect(mocks.commandFindMany).toHaveBeenCalledWith({
			where: { impactEventId: "inc-1", kind: "ACK_INCIDENT", status: "ACKED" },
			orderBy: { createdAt: "desc" },
			take: 5,
			select: { payload: true },
		});
		expect(mocks.impactUpdate).toHaveBeenCalledWith({
			where: { id: "inc-1", status: "ACKNOWLEDGED", resolution: null },
			data: expect.objectContaining({
				status: "CONFIRMED",
				ackRequestedAt: null,
			}),
		});
		expect(mocks.stateCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				type: "INCIDENT_CONFIRMED",
				metadata: expect.objectContaining({ reopened: true }),
			}),
		});
		expect(afterTasks).toHaveLength(1);

		await flushAfter();

		expect(mocks.notifyIncidentPush).toHaveBeenCalledOnce();
	});

	it("does not reopen a device-confirmed acknowledgement", async () => {
		mocks.findUnique.mockResolvedValue({
			id: "inc-1",
			status: "ACKNOWLEDGED",
			lat: null,
			lng: null,
			gpsAgeS: null,
			evidence: {},
		});
		mocks.commandFindMany.mockResolvedValue([
			{ payload: { incident_id: "client-1", ackDetail: "acknowledged" } },
		]);

		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			status: "ACKNOWLEDGED",
			duplicate: true,
			alerts_queued: 0,
		});
		expect(mocks.impactUpdate).not.toHaveBeenCalled();
		expect(afterTasks).toHaveLength(0);
	});

	it("reopens an acknowledgement that was not confirmed by the device", async () => {
		mocks.findUnique.mockResolvedValue({
			id: "inc-1",
			status: "ACKNOWLEDGED",
			lat: null,
			lng: null,
			gpsAgeS: null,
			evidence: {},
		});
		mocks.commandFindMany.mockResolvedValue([
			{ payload: { incident_id: "client-1", ackDetail: "unknown_incident" } },
		]);

		const response = await POST(request());
		const body = await response.json();

		expect(body.data).toMatchObject({ status: "CONFIRMED", duplicate: true });
		expect(mocks.impactUpdate).toHaveBeenCalledOnce();
	});
});
