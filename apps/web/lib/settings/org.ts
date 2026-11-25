import "server-only";

import { DEFAULT_FIRMWARE_CONFIG, type FirmwareConfigValues } from "@/lib/firmware/config";
import prisma from "@/lib/prisma";
import { unstable_cache } from "next/cache";

export interface ResolvedOrgSettings {
	id: string | null;
	orgId: string;
	impactThresholdG: number;
	tiltThresholdDeg: number;
	confirmWindowMs: number;
	cancelWindowS: number;
	heartbeatIntervalS: number;
	sosRetryS: number;
	telemetryRetentionDays: number;
	incidentRetentionDays: number;
	alertPhones: string[];
	alertEmails: string[];
}

export interface OrgSettingsFallback {
	orgId: string;
}

export function defaultSettings(orgId: string): ResolvedOrgSettings {
	return {
		id: null,
		orgId,
		impactThresholdG: DEFAULT_FIRMWARE_CONFIG.impactThresholdG,
		tiltThresholdDeg: DEFAULT_FIRMWARE_CONFIG.tiltThresholdDeg,
		confirmWindowMs: DEFAULT_FIRMWARE_CONFIG.confirmWindowMs,
		cancelWindowS: DEFAULT_FIRMWARE_CONFIG.cancelWindowS,
		heartbeatIntervalS: DEFAULT_FIRMWARE_CONFIG.heartbeatIntervalS,
		sosRetryS: DEFAULT_FIRMWARE_CONFIG.sosRetryS,
		telemetryRetentionDays: 30,
		incidentRetentionDays: 365,
		alertPhones: [],
		alertEmails: [],
	};
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

async function loadOrgSettings(orgId: string): Promise<ResolvedOrgSettings> {
	const row = await prisma.orgSettings.findUnique({ where: { orgId } });
	if (!row) return defaultSettings(orgId);

	return {
		id: row.id,
		orgId: row.orgId,
		impactThresholdG: row.impactThresholdG,
		tiltThresholdDeg: row.tiltThresholdDeg,
		confirmWindowMs: row.confirmWindowMs,
		cancelWindowS: row.cancelWindowS,
		heartbeatIntervalS: row.heartbeatIntervalS,
		sosRetryS: row.sosRetryS,
		telemetryRetentionDays: row.telemetryRetentionDays,
		incidentRetentionDays: row.incidentRetentionDays,
		alertPhones: asStringArray(row.alertPhones),
		alertEmails: asStringArray(row.alertEmails),
	};
}

/**
 * Settings are reference data (API regulation §8.2 rule 8). Cache for 60 s and
 * invalidate explicitly after a settings write so the device command/ingest
 * paths do not pay a database round-trip on every poll.
 */
export const getOrgSettings = unstable_cache(loadOrgSettings, ["org-settings"], {
	revalidate: 60,
	tags: ["org-settings"],
});

export function settingsToFirmwareValues(settings: ResolvedOrgSettings): FirmwareConfigValues {
	return {
		impactThresholdG: settings.impactThresholdG,
		tiltThresholdDeg: settings.tiltThresholdDeg,
		confirmWindowMs: settings.confirmWindowMs,
		cancelWindowS: settings.cancelWindowS,
		heartbeatIntervalS: settings.heartbeatIntervalS,
		sosRetryS: settings.sosRetryS,
	};
}
