import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	trackerDevice: {
		findUnique: vi.fn(),
		create: vi.fn(),
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

import { type DeviceTokenState, createDeviceAction } from "./devices";

const initial: DeviceTokenState = { ok: false };

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
	mocks.vehicle.findFirst.mockResolvedValue({ id: "vehicle-1" });
	mocks.auditLog.create.mockResolvedValue({});
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
			mac: "Use a MAC address like AA:BB:CC:DD:EE:FF.",
		});
		expect(state.values?.mac).toBe("not-a-mac");
		expect(mocks.trackerDevice.findUnique).not.toHaveBeenCalled();
		expect(mocks.trackerDevice.create).not.toHaveBeenCalled();
	});

	it("maps multiple schema errors to their fields and keeps the input", async () => {
		const state = await createDeviceAction(initial, registration({ mac: "nope", label: "x" }));

		expect(state.fieldErrors).toEqual({
			mac: "Use a MAC address like AA:BB:CC:DD:EE:FF.",
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
