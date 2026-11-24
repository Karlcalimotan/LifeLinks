import { ok } from "@/lib/api/envelope";
import { ApiError, unauthorized } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import prisma from "@/lib/prisma";
import {
	RETENTION_BATCH_SIZE,
	RETENTION_MAX_BATCHES,
	retentionCutoff,
} from "@/lib/retention/retention";
import { safeEqualText } from "@/lib/security/constant-time";

export const dynamic = "force-dynamic";
/** The nightly cleanup may need more than the 2 s hot-path budget. */
export const maxDuration = 60;

interface TableResult {
	cutoff: string | null;
	deleted: number;
	batches: number;
	truncated: boolean;
}

interface IncidentResult extends TableResult {
	alertDeliveriesDeleted: number;
}

interface OrgResult {
	orgId: string;
	telemetry: TableResult;
	incidents: IncidentResult;
}

async function drainTelemetry(orgId: string, cutoff: Date): Promise<TableResult> {
	let deleted = 0;
	let batches = 0;

	while (batches < RETENTION_MAX_BATCHES) {
		const rows = await prisma.telemetrySample.findMany({
			where: { recordedAt: { lt: cutoff }, device: { orgId } },
			select: { id: true },
			take: RETENTION_BATCH_SIZE,
		});
		if (rows.length === 0) {
			return { cutoff: cutoff.toISOString(), deleted, batches, truncated: false };
		}

		const result = await prisma.telemetrySample.deleteMany({
			where: { id: { in: rows.map((row) => row.id) } },
		});
		deleted += result.count;
		batches += 1;

		if (rows.length < RETENTION_BATCH_SIZE) {
			return { cutoff: cutoff.toISOString(), deleted, batches, truncated: false };
		}
	}

	return { cutoff: cutoff.toISOString(), deleted, batches, truncated: true };
}

async function drainIncidents(orgId: string, cutoff: Date): Promise<IncidentResult> {
	let deleted = 0;
	let alertDeliveriesDeleted = 0;
	let batches = 0;

	while (batches < RETENTION_MAX_BATCHES) {
		const rows = await prisma.impactEvent.findMany({
			where: { orgId, createdAt: { lt: cutoff } },
			select: { id: true },
			take: RETENTION_BATCH_SIZE,
		});
		if (rows.length === 0) {
			return {
				cutoff: cutoff.toISOString(),
				deleted,
				alertDeliveriesDeleted,
				batches,
				truncated: false,
			};
		}

		const ids = rows.map((row) => row.id);
		// AlertDelivery has a database cascade and DeviceCommand is set to null,
		// but dependants are removed explicitly in one batch transaction so the
		// cleanup does not depend on a referential action and the alert count is
		// recorded. No device command is deleted; it loses only the incident link.
		const [alerts, incidents] = await prisma.$transaction([
			prisma.alertDelivery.deleteMany({ where: { impactEventId: { in: ids } } }),
			prisma.impactEvent.deleteMany({ where: { id: { in: ids } } }),
		]);
		alertDeliveriesDeleted += alerts.count;
		deleted += incidents.count;
		batches += 1;

		if (rows.length < RETENTION_BATCH_SIZE) {
			return {
				cutoff: cutoff.toISOString(),
				deleted,
				alertDeliveriesDeleted,
				batches,
				truncated: false,
			};
		}
	}

	return {
		cutoff: cutoff.toISOString(),
		deleted,
		alertDeliveriesDeleted,
		batches,
		truncated: true,
	};
}

async function countTelemetry(orgId: string, cutoff: Date): Promise<number> {
	return prisma.telemetrySample.count({
		where: { recordedAt: { lt: cutoff }, device: { orgId } },
	});
}

async function countIncidents(
	orgId: string,
	cutoff: Date,
): Promise<{ incidents: number; alertDeliveries: number }> {
	const incidents = await prisma.impactEvent.count({
		where: { orgId, createdAt: { lt: cutoff } },
	});
	const alertDeliveries = await prisma.alertDelivery.count({
		where: { impact: { orgId, createdAt: { lt: cutoff } } },
	});
	return { incidents, alertDeliveries };
}

export const GET = withApi(
	async (request) => {
		const secret = process.env.CRON_SECRET?.trim();
		if (!secret) {
			// Fail closed: without a configured secret the job must not delete.
			throw new ApiError(503, "INTERNAL", "CRON_SECRET is not configured.");
		}
		const authorization = request.headers.get("authorization") ?? "";
		if (!safeEqualText(authorization, `Bearer ${secret}`)) {
			throw unauthorized("Invalid cron secret.");
		}

		const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
		const now = new Date();

		const organisations = await prisma.orgSettings.findMany({
			select: { orgId: true, telemetryRetentionDays: true, incidentRetentionDays: true },
			orderBy: { orgId: "asc" },
		});

		const results: OrgResult[] = [];
		let telemetryDeleted = 0;
		let incidentsDeleted = 0;
		let alertDeliveriesDeleted = 0;

		for (const settings of organisations) {
			const telemetryCutoff = retentionCutoff(now, settings.telemetryRetentionDays);
			const incidentCutoff = retentionCutoff(now, settings.incidentRetentionDays);

			let telemetry: TableResult;
			if (telemetryCutoff === null) {
				telemetry = { cutoff: null, deleted: 0, batches: 0, truncated: false };
			} else if (dryRun) {
				telemetry = {
					cutoff: telemetryCutoff.toISOString(),
					deleted: await countTelemetry(settings.orgId, telemetryCutoff),
					batches: 0,
					truncated: false,
				};
			} else {
				telemetry = await drainTelemetry(settings.orgId, telemetryCutoff);
			}

			let incidents: IncidentResult;
			if (incidentCutoff === null) {
				incidents = {
					cutoff: null,
					deleted: 0,
					alertDeliveriesDeleted: 0,
					batches: 0,
					truncated: false,
				};
			} else if (dryRun) {
				const counts = await countIncidents(settings.orgId, incidentCutoff);
				incidents = {
					cutoff: incidentCutoff.toISOString(),
					deleted: counts.incidents,
					alertDeliveriesDeleted: counts.alertDeliveries,
					batches: 0,
					truncated: false,
				};
			} else {
				incidents = await drainIncidents(settings.orgId, incidentCutoff);
			}

			telemetryDeleted += telemetry.deleted;
			incidentsDeleted += incidents.deleted;
			alertDeliveriesDeleted += incidents.alertDeliveriesDeleted;

			// One audit row per organisation per run. It records configuration and
			// counts only: no coordinates, phone numbers, plate numbers or evidence.
			await prisma.auditLog.create({
				data: {
					orgId: settings.orgId,
					action: "retention.cleanup",
					target: settings.orgId,
					metadata: {
						dryRun,
						telemetryRetentionDays: settings.telemetryRetentionDays,
						incidentRetentionDays: settings.incidentRetentionDays,
						telemetryCutoff: telemetry.cutoff,
						incidentCutoff: incidents.cutoff,
						telemetryDeleted: telemetry.deleted,
						incidentsDeleted: incidents.deleted,
						alertDeliveriesDeleted: incidents.alertDeliveriesDeleted,
						telemetryBatches: telemetry.batches,
						incidentBatches: incidents.batches,
						truncated: telemetry.truncated || incidents.truncated,
					},
				},
			});

			results.push({ orgId: settings.orgId, telemetry, incidents });
		}

		return ok({
			dryRun,
			organisations: results,
			totals: { telemetryDeleted, incidentsDeleted, alertDeliveriesDeleted },
		});
	},
	{ route: "GET /api/cron/retention", timeoutMs: 55_000 },
);
