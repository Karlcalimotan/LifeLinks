import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deviceConfigOverride: { findFirst: vi.fn() },
	getOrgSettings: vi.fn(),
	settingsToFirmwareValues: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: { deviceConfigOverride: mocks.deviceConfigOverride },
}));

vi.mock("@/lib/settings/org", () => ({
	getOrgSettings: mocks.getOrgSettings,
	settingsToFirmwareValues: mocks.settingsToFirmwareValues,
}));

import { type FirmwareConfigValues, buildFirmwareConfig } from "@/lib/firmware/config";
import { getDeviceConfig } from "./device-config";

const ORG: FirmwareConfigValues = {
	impactThresholdG: 2.5,
	tiltThresholdDeg: 60,
	confirmWindowMs: 200,
	cancelWindowS: 15,
	heartbeatIntervalS: 30,
	sosRetryS: 60,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getOrgSettings.mockResolvedValue({ orgId: "org-1", ...ORG });
	mocks.settingsToFirmwareValues.mockReturnValue(ORG);
	mocks.deviceConfigOverride.findFirst.mockResolvedValue(null);
});

describe("getDeviceConfig", () => {
	it("uses the organisation defaults when there is no override row", async () => {
		const resolved = await getDeviceConfig("org-1", "device-1");

		expect(mocks.deviceConfigOverride.findFirst).toHaveBeenCalledWith({
			where: { deviceId: "device-1", orgId: "org-1" },
		});
		expect(resolved.overrides).toEqual({});
		expect(resolved.values).toEqual(ORG);
		expect(resolved.config).toEqual(buildFirmwareConfig(ORG));
	});

	it("merges the device override over the organisation default", async () => {
		mocks.deviceConfigOverride.findFirst.mockResolvedValue({
			impactThresholdG: 3.5,
			tiltThresholdDeg: null,
			confirmWindowMs: 500,
			cancelWindowS: null,
			heartbeatIntervalS: null,
			sosRetryS: 120,
		});

		const resolved = await getDeviceConfig("org-1", "device-1");

		expect(resolved.overrides).toEqual({
			impactThresholdG: 3.5,
			confirmWindowMs: 500,
			sosRetryS: 120,
		});
		expect(resolved.values).toEqual({
			...ORG,
			impactThresholdG: 3.5,
			confirmWindowMs: 500,
			sosRetryS: 120,
		});
		expect(resolved.config.rev).toBe(
			buildFirmwareConfig({
				...ORG,
				impactThresholdG: 3.5,
				confirmWindowMs: 500,
				sosRetryS: 120,
			}).rev,
		);
		expect(resolved.orgValues).toEqual(ORG);
	});
});
