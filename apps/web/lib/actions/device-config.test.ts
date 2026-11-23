import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	$transaction: vi.fn(),
	trackerDevice: { findFirst: vi.fn() },
	deviceConfigOverride: {
		findFirst: vi.fn(),
		deleteMany: vi.fn(),
		upsert: vi.fn(),
	},
	deviceCommand: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
	auditLog: { create: vi.fn() },
	requireUser: vi.fn(),
	canAdminister: vi.fn(),
	getOrgSettings: vi.fn(),
	settingsToFirmwareValues: vi.fn(),
	revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		$transaction: mocks.$transaction,
		trackerDevice: mocks.trackerDevice,
		deviceConfigOverride: mocks.deviceConfigOverride,
		deviceCommand: mocks.deviceCommand,
		auditLog: mocks.auditLog,
	},
}));

vi.mock("@/lib/auth/session", () => ({
	requireUser: mocks.requireUser,
	canAdminister: mocks.canAdminister,
}));

vi.mock("@/lib/settings/org", () => ({
	getOrgSettings: mocks.getOrgSettings,
	settingsToFirmwareValues: mocks.settingsToFirmwareValues,
}));

vi.mock("next/cache", () => ({
	revalidatePath: mocks.revalidatePath,
}));

import {
	CONFIG_FIELDS,
	type FirmwareConfigValues,
	buildFirmwareConfig,
} from "@/lib/firmware/config";
import { overrideInputName } from "@/lib/firmware/device-config";
import { type DeviceConfigState, updateDeviceConfigAction } from "./device-config";

const initial: DeviceConfigState = { ok: false };

const ORG: FirmwareConfigValues = {
	impactThresholdG: 2.5,
	tiltThresholdDeg: 60,
	confirmWindowMs: 200,
	cancelWindowS: 15,
	heartbeatIntervalS: 30,
	sosRetryS: 60,
};

const MERGED: FirmwareConfigValues = { ...ORG, impactThresholdG: 3.5 };
const MERGED_CONFIG = buildFirmwareConfig(MERGED);

function configForm(values: Partial<Record<keyof FirmwareConfigValues, string>>): FormData {
	const data = new FormData();
	data.set("locale", "en");
	data.set("deviceId", "device-1");
	for (const field of CONFIG_FIELDS) {
		const value = values[field.key];
		if (value == null) {
			data.set(overrideInputName(field.key), "on");
		} else {
			data.set(field.key, value);
		}
	}
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
	mocks.trackerDevice.findFirst.mockResolvedValue({
		id: "device-1",
		mac: "24:0A:C4:9F:2A:71",
		configRev: 100,
	});
	mocks.deviceConfigOverride.findFirst.mockResolvedValue(null);
	mocks.deviceConfigOverride.deleteMany.mockResolvedValue({ count: 0 });
	mocks.deviceConfigOverride.upsert.mockResolvedValue({});
	mocks.deviceCommand.findFirst.mockResolvedValue(null);
	mocks.deviceCommand.create.mockResolvedValue({ id: "command-1" });
	mocks.deviceCommand.updateMany.mockResolvedValue({ count: 0 });
	mocks.auditLog.create.mockResolvedValue({});
	mocks.getOrgSettings.mockResolvedValue({ orgId: "org-1", ...ORG });
	mocks.settingsToFirmwareValues.mockReturnValue(ORG);
	mocks.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
		callback({
			deviceConfigOverride: mocks.deviceConfigOverride,
			deviceCommand: mocks.deviceCommand,
			auditLog: mocks.auditLog,
		}),
	);
});

describe("updateDeviceConfigAction", () => {
	it("rejects a non-admin before reading the device", async () => {
		mocks.canAdminister.mockReturnValue(false);

		const state = await updateDeviceConfigAction(initial, configForm({}));

		expect(state).toEqual({ ok: false, error: "forbidden" });
		expect(mocks.trackerDevice.findFirst).not.toHaveBeenCalled();
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("rejects a tracker from another organisation", async () => {
		mocks.trackerDevice.findFirst.mockResolvedValue(null);

		const state = await updateDeviceConfigAction(initial, configForm({}));

		expect(state).toEqual({ ok: false, error: "notfound" });
		expect(mocks.trackerDevice.findFirst).toHaveBeenCalledWith({
			where: { id: "device-1", orgId: "org-1" },
			select: { id: true, mac: true, configRev: true },
		});
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("returns field-level codes for out-of-envelope and fractional input without writing", async () => {
		const state = await updateDeviceConfigAction(
			initial,
			configForm({ impactThresholdG: "9", confirmWindowMs: "200.5" }),
		);

		expect(state).toEqual({
			ok: false,
			error: "invalid",
			fieldErrors: {
				impactThresholdG: { code: "above_max" },
				confirmWindowMs: { code: "fractional" },
			},
		});
		expect(mocks.$transaction).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("stores the overrides and queues the merged SET_CONFIG with a before/after audit", async () => {
		const state = await updateDeviceConfigAction(initial, configForm({ impactThresholdG: "3.5" }));

		expect(state).toEqual({
			ok: true,
			changed: true,
			pushed: true,
			pushState: "pending",
			rev: MERGED_CONFIG.rev,
		});
		expect(mocks.deviceConfigOverride.upsert).toHaveBeenCalledWith({
			where: { deviceId: "device-1" },
			create: {
				deviceId: "device-1",
				orgId: "org-1",
				impactThresholdG: 3.5,
				tiltThresholdDeg: null,
				confirmWindowMs: null,
				cancelWindowS: null,
				heartbeatIntervalS: null,
				sosRetryS: null,
			},
			update: {
				impactThresholdG: 3.5,
				tiltThresholdDeg: null,
				confirmWindowMs: null,
				cancelWindowS: null,
				heartbeatIntervalS: null,
				sosRetryS: null,
			},
		});
		expect(mocks.deviceCommand.create).toHaveBeenCalledWith({
			data: {
				deviceId: "device-1",
				kind: "SET_CONFIG",
				payload: MERGED_CONFIG,
				expiresAt: expect.any(Date),
			},
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-1",
				action: "device.config_updated",
				target: "device-1",
				metadata: {
					mac: "24:0A:C4:9F:2A:71",
					before: {},
					after: { impactThresholdG: 3.5 },
					beforeMerged: ORG,
					merged: MERGED,
					rev: MERGED_CONFIG.rev,
					pushed: true,
					commandId: "command-1",
				},
			},
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/devices/device-1");
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/devices");
	});

	it("does not push when the device already reports the merged revision", async () => {
		mocks.trackerDevice.findFirst.mockResolvedValue({
			id: "device-1",
			mac: "24:0A:C4:9F:2A:71",
			configRev: MERGED_CONFIG.rev,
		});

		const state = await updateDeviceConfigAction(initial, configForm({ impactThresholdG: "3.5" }));

		expect(state).toEqual({
			ok: true,
			changed: true,
			pushed: false,
			pushState: "confirmed",
			rev: MERGED_CONFIG.rev,
		});
		expect(mocks.deviceCommand.create).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				metadata: expect.objectContaining({ pushed: false, commandId: null }),
			}),
		});
	});

	it("deletes the row and audits the reset when every field returns to the organisation default", async () => {
		mocks.deviceConfigOverride.findFirst.mockResolvedValue({
			impactThresholdG: 3.5,
			tiltThresholdDeg: null,
			confirmWindowMs: null,
			cancelWindowS: null,
			heartbeatIntervalS: null,
			sosRetryS: null,
		});

		const state = await updateDeviceConfigAction(initial, configForm({}));

		expect(state.ok).toBe(true);
		expect(mocks.deviceConfigOverride.deleteMany).toHaveBeenCalledWith({
			where: { deviceId: "device-1", orgId: "org-1" },
		});
		expect(mocks.deviceConfigOverride.upsert).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				metadata: expect.objectContaining({
					before: { impactThresholdG: 3.5 },
					after: {},
					pushed: true,
				}),
			}),
		});
	});

	it("does not write or audit when nothing changed", async () => {
		const state = await updateDeviceConfigAction(initial, configForm({}));

		expect(state).toEqual({
			ok: true,
			changed: false,
			pushed: false,
			rev: buildFirmwareConfig(ORG).rev,
		});
		expect(mocks.$transaction).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("does not queue a duplicate when the same revision is still pending", async () => {
		mocks.deviceConfigOverride.findFirst.mockResolvedValue({
			impactThresholdG: 3.5,
			tiltThresholdDeg: null,
			confirmWindowMs: null,
			cancelWindowS: null,
			heartbeatIntervalS: null,
			sosRetryS: null,
		});
		mocks.deviceCommand.findFirst.mockResolvedValue({
			id: "command-old",
			status: "PENDING",
			payload: MERGED_CONFIG,
		});

		// The override set changes (tilt becomes explicit) but the merged
		// configuration, and therefore the revision, is unchanged.
		const state = await updateDeviceConfigAction(
			initial,
			configForm({ impactThresholdG: "3.5", tiltThresholdDeg: "60" }),
		);

		expect(state).toEqual({
			ok: true,
			changed: true,
			pushed: false,
			pushState: "pending",
			rev: MERGED_CONFIG.rev,
		});
		expect(mocks.deviceCommand.create).not.toHaveBeenCalled();
		expect(mocks.deviceCommand.updateMany).not.toHaveBeenCalled();
	});

	it("re-pushes the same revision when the previous command failed", async () => {
		mocks.deviceConfigOverride.findFirst.mockResolvedValue({
			impactThresholdG: 3.5,
			tiltThresholdDeg: null,
			confirmWindowMs: null,
			cancelWindowS: null,
			heartbeatIntervalS: null,
			sosRetryS: null,
		});
		mocks.deviceCommand.findFirst.mockResolvedValue({
			id: "command-old",
			status: "FAILED",
			payload: MERGED_CONFIG,
		});

		const state = await updateDeviceConfigAction(
			initial,
			configForm({ impactThresholdG: "3.5", tiltThresholdDeg: "60" }),
		);

		expect(state).toEqual({
			ok: true,
			changed: true,
			pushed: true,
			pushState: "pending",
			rev: MERGED_CONFIG.rev,
		});
		expect(mocks.deviceCommand.updateMany).toHaveBeenCalledWith({
			where: { deviceId: "device-1", kind: "SET_CONFIG", status: "PENDING" },
			data: { status: "EXPIRED" },
		});
		expect(mocks.deviceCommand.create).toHaveBeenCalled();
	});
});
