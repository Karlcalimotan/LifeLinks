import "server-only";

import { DEFAULT_FIRMWARE_CONFIG, type FirmwareConfigValues } from "@/lib/firmware/config";
import prisma from "@/lib/prisma";

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
	parkedImpactAlerts: boolean;
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
		parkedImpactAlerts: false,
	};
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

export async function getOrgSettings(orgId: string): Promise<ResolvedOrgSettings> {
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
		parkedImpactAlerts: row.parkedImpactAlerts,
	};
}

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
