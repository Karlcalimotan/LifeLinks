import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireDevice: vi.fn(),
	getDeviceConfig: vi.fn(),
	commandFindMany: vi.fn(),
	contactFindMany: vi.fn(),
	deviceUpdate: vi.fn(),
	commandUpdateMany: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("@/lib/api/instrumentation", () => ({
	withApi: (handler: unknown) => handler,
}));

vi.mock("@/lib/device/auth", () => ({
	requireDevice: mocks.requireDevice,
	isDeviceApproved: () => true,
}));

vi.mock("@/lib/settings/device-config", () => ({
	getDeviceConfig: mocks.getDeviceConfig,
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		trackerDevice: { update: mocks.deviceUpdate },
		deviceCommand: {
			findMany: mocks.commandFindMany,
			updateMany: mocks.commandUpdateMany,
		},
		emergencyContact: { findMany: mocks.contactFindMany },
		$transaction: mocks.transaction,
	},
}));

import { GET } from "./route";

const deviceId = "AA:BB:CC:DD:EE:01";
const orgPhones = ["+639171234567", "+639181234567"];

function request(): Request {
	return new Request(`http://localhost/api/device/command?device_id=${deviceId}`, {
		headers: { "x-device-token": "test-token" },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireDevice.mockResolvedValue({
		id: "dev-1",
		mac: deviceId,
		orgId: "org-1",
		vehicleId: "veh-1",
		approvalStatus: "APPROVED",
	});
	mocks.getDeviceConfig.mockResolvedValue({
		settings: { alertPhones: orgPhones },
		config: { version: 1, rev: 1 },
	});
	mocks.commandFindMany.mockResolvedValue([]);
	mocks.commandUpdateMany.mockResolvedValue({ count: 0 });
	mocks.deviceUpdate.mockResolvedValue({});
	mocks.contactFindMany.mockResolvedValue([]);
	mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
		Promise.all(operations),
	);
});

describe("GET /api/device/command alert_phones", () => {
	it("prefers at most two active vehicle contacts", async () => {
		mocks.contactFindMany.mockResolvedValue([
			{ phone: "+639170000001", active: true },
			{ phone: "+639170000002", active: true },
			{ phone: "+639170000003", active: true },
		]);

		const response = await GET(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.contactFindMany).toHaveBeenCalledWith({
			where: { orgId: "org-1", vehicleId: "veh-1", active: true },
			orderBy: { createdAt: "asc" },
			select: { phone: true, active: true },
		});
		expect(body.data.alert_phones).toEqual(["+639170000001", "+639170000002"]);
	});

	it("falls back to the organisation phones when the vehicle has no contact", async () => {
		const response = await GET(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.alert_phones).toEqual(orgPhones);
	});

	it("does not query contacts when the tracker has no vehicle", async () => {
		mocks.requireDevice.mockResolvedValue({
			id: "dev-1",
			mac: deviceId,
			orgId: "org-1",
			vehicleId: null,
			approvalStatus: "APPROVED",
		});

		const response = await GET(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.contactFindMany).not.toHaveBeenCalled();
		expect(body.data.alert_phones).toEqual(orgPhones);
	});
});
