import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	$transaction: vi.fn(),
	trackerDevice: {
		findUnique: vi.fn(),
		findMany: vi.fn(),
		create: vi.fn(),
		updateMany: vi.fn(),
	},
	vehicle: {
		findFirst: vi.fn(),
	},
	auditLog: {
		create: vi.fn(),
	},
	requireUser: vi.fn(),
	canAdminister: vi.fn(),
	generateDeviceToken: vi.fn(),
	hashDeviceToken: vi.fn(),
	revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		$transaction: mocks.$transaction,
		trackerDevice: mocks.trackerDevice,
		vehicle: mocks.vehicle,
		auditLog: mocks.auditLog,
	},
}));

vi.mock("@/lib/auth/session", () => ({
	requireUser: mocks.requireUser,
	canAdminister: mocks.canAdminister,
}));

vi.mock("@/lib/device/auth", () => ({
	generateDeviceToken: mocks.generateDeviceToken,
	hashDeviceToken: mocks.hashDeviceToken,
}));

vi.mock("next/cache", () => ({
	revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
	redirect: vi.fn(),
}));

import {
	type BulkApproveState,
	type DeviceTokenState,
	bulkApproveDevicesAction,
	createDeviceAction,
} from "./devices";

const initial: DeviceTokenState = { ok: false };
const initialBulk: BulkApproveState = { ok: false };

function registration(
	values: Partial<Record<"mac" | "label" | "vehicleId", string>> = {},
): FormData {
	const data = new FormData();
	data.set("locale", "en");
	data.set("mac", values.mac ?? "AA:BB:CC:DD:EE:01");
	data.set("label", values.label ?? "Navara tracker");
	data.set("vehicleId", values.vehicleId ?? "");
	return data;
}

function bulkForm(ids: readonly string[]): FormData {
	const data = new FormData();
	data.set("locale", "en");
	for (const id of ids) data.append("deviceIds", id);
	return data;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({
		user: { id: "user-1" },
		org: { id: "org-1" },
		role: "ADMIN",
	});
	mocks.canAdminister.mockReturnValue(true);
	mocks.generateDeviceToken.mockReturnValue("raw-token");
	mocks.hashDeviceToken.mockReturnValue("hash-raw-token");
	mocks.trackerDevice.findUnique.mockResolvedValue(null);
	mocks.trackerDevice.create.mockImplementation(async ({ data }) => ({ id: "device-1", ...data }));
	mocks.trackerDevice.findMany.mockResolvedValue([]);
	mocks.trackerDevice.updateMany.mockResolvedValue({ count: 1 });
	mocks.vehicle.findFirst.mockResolvedValue({ id: "vehicle-1" });
	mocks.auditLog.create.mockResolvedValue({});
	mocks.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
		callback({ trackerDevice: mocks.trackerDevice, auditLog: mocks.auditLog }),
	);
});

describe("createDeviceAction", () => {
	it("creates a tracker with a normalized MAC", async () => {
		const state = await createDeviceAction(initial, registration({ mac: "aa-bb-cc-dd-ee-01" }));

		expect(state.ok).toBe(true);
		expect(state.token).toBe("raw-token");
		expect(state.mac).toBe("AA:BB:CC:DD:EE:01");
		expect(mocks.trackerDevice.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				vehicleId: null,
				mac: "AA:BB:CC:DD:EE:01",
				label: "Navara tracker",
				tokenHash: "hash-raw-token",
				approvalStatus: "APPROVED",
			},
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "device.created",
				metadata: { mac: "AA:BB:CC:DD:EE:01", vehicleId: null },
			}),
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/devices");
	});

	it("returns field errors for a malformed MAC without touching the database", async () => {
		const state = await createDeviceAction(initial, registration({ mac: "not-a-mac" }));

		expect(state.ok).toBe(false);
		expect(state.error).toBeUndefined();
		expect(state.fieldErrors).toEqual({
			mac: "Use a MAC address like 24:0A:C4:9F:2A:71.",
		});
		expect(state.values?.mac).toBe("not-a-mac");
		expect(mocks.trackerDevice.findUnique).not.toHaveBeenCalled();
		expect(mocks.trackerDevice.create).not.toHaveBeenCalled();
	});

	it("maps multiple schema errors to their fields and keeps the input", async () => {
		const state = await createDeviceAction(initial, registration({ mac: "nope", label: "x" }));

		expect(state.fieldErrors).toEqual({
			mac: "Use a MAC address like 24:0A:C4:9F:2A:71.",
			label: "Enter a device label.",
		});
		expect(state.values).toMatchObject({ mac: "nope", label: "x" });
		expect(mocks.trackerDevice.create).not.toHaveBeenCalled();
	});

	it("rejects a duplicate MAC before creating a second row", async () => {
		mocks.trackerDevice.findUnique.mockResolvedValue({ id: "existing-device" });

		const state = await createDeviceAction(initial, registration());

		expect(state.ok).toBe(false);
		expect(state.fieldErrors).toEqual({
			mac: "A tracker with this MAC is already registered.",
		});
		expect(state.values?.label).toBe("Navara tracker");
		expect(mocks.trackerDevice.create).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("maps a unique-index race on the MAC to the duplicate field error", async () => {
		mocks.trackerDevice.create.mockRejectedValue(
			Object.assign(new Error("unique"), {
				code: "P2002",
				meta: { target: ["mac"] },
			}),
		);

		const state = await createDeviceAction(initial, registration());

		expect(state.ok).toBe(false);
		expect(state.fieldErrors).toEqual({
			mac: "A tracker with this MAC is already registered.",
		});
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("does not hide a unique-index failure that is not the MAC", async () => {
		mocks.trackerDevice.create.mockRejectedValue(
			Object.assign(new Error("unique token hash"), {
				code: "P2002",
				meta: { target: ["tokenHash"] },
			}),
		);

		await expect(createDeviceAction(initial, registration())).rejects.toThrow("unique token hash");
	});

	it("rejects a vehicle outside the current organization", async () => {
		mocks.vehicle.findFirst.mockResolvedValue(null);

		const state = await createDeviceAction(
			initial,
			registration({ vehicleId: "vehicle-other-org" }),
		);

		expect(state.ok).toBe(false);
		expect(state.fieldErrors).toEqual({
			vehicleId: "Choose a vehicle from your organization.",
		});
		expect(mocks.vehicle.findFirst).toHaveBeenCalledWith({
			where: { id: "vehicle-other-org", orgId: "org-1" },
			select: { id: true },
		});
		expect(mocks.trackerDevice.create).not.toHaveBeenCalled();
	});

	it("assigns a vehicle from the current organization", async () => {
		const state = await createDeviceAction(initial, registration({ vehicleId: "vehicle-1" }));

		expect(state.ok).toBe(true);
		expect(mocks.trackerDevice.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ vehicleId: "vehicle-1" }),
		});
	});

	it("rejects a non-admin before reading the form", async () => {
		mocks.canAdminister.mockReturnValue(false);

		const state = await createDeviceAction(initial, registration());

		expect(state).toEqual({ ok: false, error: "Only admins can register trackers." });
		expect(mocks.trackerDevice.findUnique).not.toHaveBeenCalled();
	});
});

describe("bulkApproveDevicesAction", () => {
	it("rejects a non-admin before reading the form", async () => {
		mocks.canAdminister.mockReturnValue(false);

		const state = await bulkApproveDevicesAction(initialBulk, bulkForm(["device-1"]));

		expect(state).toEqual({ ok: false, error: "forbidden" });
		expect(mocks.trackerDevice.findMany).not.toHaveBeenCalled();
	});

	it("rejects an empty or oversized selection before reading devices", async () => {
		const empty = await bulkApproveDevicesAction(initialBulk, bulkForm([]));
		const tooMany = await bulkApproveDevicesAction(
			initialBulk,
			bulkForm(Array.from({ length: 51 }, (_, index) => `device-${index}`)),
		);

		expect(empty).toEqual({ ok: false, error: "invalid" });
		expect(tooMany).toEqual({ ok: false, error: "too_many" });
		expect(mocks.trackerDevice.findMany).not.toHaveBeenCalled();
	});

	it("deduplicates ids and scopes the candidate query to pending devices in the org", async () => {
		mocks.trackerDevice.findMany.mockResolvedValue([
			{ id: "device-1", mac: "24:0A:C4:9F:2A:71" },
			{ id: "device-2", mac: "24:0A:C4:9F:2A:72" },
		]);

		const state = await bulkApproveDevicesAction(
			initialBulk,
			bulkForm([" device-1 ", "device-2", "device-1"]),
		);

		expect(mocks.trackerDevice.findMany).toHaveBeenCalledWith({
			where: {
				id: { in: ["device-1", "device-2"] },
				orgId: "org-1",
				approvalStatus: "PENDING",
			},
			select: { id: true, mac: true },
		});
		expect(state).toEqual({ ok: true, approved: 2, skipped: 0 });
		expect(mocks.trackerDevice.updateMany).toHaveBeenCalledTimes(2);
		expect(mocks.trackerDevice.updateMany).toHaveBeenCalledWith({
			where: { id: "device-1", orgId: "org-1", approvalStatus: "PENDING" },
			data: { approvalStatus: "APPROVED" },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledTimes(2);
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				orgId: "org-1",
				actorId: "user-1",
				action: "device.approved",
				target: "device-1",
				metadata: {
					mac: "24:0A:C4:9F:2A:71",
					previousStatus: "PENDING",
					bulk: true,
				},
			}),
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/devices");
	});

	it("reports ids that are no longer pending as skipped", async () => {
		mocks.trackerDevice.findMany.mockResolvedValue([{ id: "device-1", mac: "24:0A:C4:9F:2A:71" }]);

		const state = await bulkApproveDevicesAction(
			initialBulk,
			bulkForm(["device-1", "device-stale", "device-rejected"]),
		);

		expect(state).toEqual({ ok: true, approved: 1, skipped: 2 });
	});

	it("returns none when no submitted tracker is still pending in the org", async () => {
		mocks.trackerDevice.findMany.mockResolvedValue([]);

		const state = await bulkApproveDevicesAction(
			initialBulk,
			bulkForm(["device-other-org", "device-rejected"]),
		);

		expect(state).toEqual({ ok: false, approved: 0, skipped: 2, error: "none" });
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("keeps successful approvals when one device fails", async () => {
		mocks.trackerDevice.findMany.mockResolvedValue([
			{ id: "device-1", mac: "24:0A:C4:9F:2A:71" },
			{ id: "device-2", mac: "24:0A:C4:9F:2A:72" },
		]);
		mocks.$transaction
			.mockImplementationOnce(async (callback: (tx: unknown) => unknown) =>
				callback({ trackerDevice: mocks.trackerDevice, auditLog: mocks.auditLog }),
			)
			.mockRejectedValueOnce(new Error("database unavailable"));

		const state = await bulkApproveDevicesAction(initialBulk, bulkForm(["device-1", "device-2"]));

		expect(state).toEqual({ ok: true, approved: 1, skipped: 1 });
		expect(mocks.auditLog.create).toHaveBeenCalledTimes(1);
	});

	it("reports a failure when every candidate update is no longer pending", async () => {
		mocks.trackerDevice.findMany.mockResolvedValue([{ id: "device-1", mac: "24:0A:C4:9F:2A:71" }]);
		mocks.trackerDevice.updateMany.mockResolvedValue({ count: 0 });

		const state = await bulkApproveDevicesAction(initialBulk, bulkForm(["device-1"]));

		expect(state).toEqual({ ok: false, approved: 0, skipped: 1, error: "failed" });
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});
});
