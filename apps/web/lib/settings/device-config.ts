import "server-only";

import {
	type FirmwareConfigObject,
	type FirmwareConfigValues,
	buildFirmwareConfig,
} from "@/lib/firmware/config";
import {
	type DeviceConfigOverrides,
	mergeDeviceConfig,
	overrideRowToValues,
} from "@/lib/firmware/device-config";
import prisma from "@/lib/prisma";
import { type ResolvedOrgSettings, getOrgSettings, settingsToFirmwareValues } from "./org";

export interface ResolvedDeviceConfig {
	settings: ResolvedOrgSettings;
	orgValues: FirmwareConfigValues;
	overrides: DeviceConfigOverrides;
	values: FirmwareConfigValues;
	config: FirmwareConfigObject;
}

/**
 * The effective configuration for one tracker: each override field wins over
 * the organisation default. The command poll, heartbeat, ingest and the
 * dashboard all resolve through here so the revision they report is the same.
 */
export async function getDeviceConfig(
	orgId: string,
	deviceId: string,
): Promise<ResolvedDeviceConfig> {
	const [settings, row] = await Promise.all([
		getOrgSettings(orgId),
		prisma.deviceConfigOverride.findFirst({ where: { deviceId, orgId } }),
	]);

	const orgValues = settingsToFirmwareValues(settings);
	const overrides = overrideRowToValues(row);
	const values = mergeDeviceConfig(orgValues, overrides);

	return {
		settings,
		orgValues,
		overrides,
		values,
		config: buildFirmwareConfig(values),
	};
}
