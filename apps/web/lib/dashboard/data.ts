import "server-only";

import { type MemberRoleName, vehicleScope } from "@/lib/auth/roles";
import { DEVICE_OFFLINE_AFTER_MIN } from "@/lib/constants";
import {
	type AcknowledgementSample,
	type TrendBucket,
	averageAcknowledgementMs,
	bucketByManilaDay,
	lastManilaDays,
} from "@/lib/dashboard/metrics";
import { LOW_BATTERY_V } from "@/lib/device/query";
import { isValidCoordinate } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { manilaDayStart, minutesAgo } from "@/lib/time";

const DAY_MS = 86_400_000;
const ACTIVITY_DAYS = 7;
const ACTIVITY_LIMIT = 8;

export interface DashboardScope {
	role: MemberRoleName;
	orgId: string;
	userId: string;
}

export interface DashboardQueueIncident {
	id: string;
	status: string;
	detectedAt: Date;
	peakAccelG: number;
	tiltDeg: number;
	vehicle: { id: string; plateNo: string; driverName: string | null };
}

export interface DashboardMapVehicle {
	vehicleId: string;
	plateNo: string;
	driverName: string | null;
	deviceId: string;
	deviceLabel: string;
	lat: number;
	lng: number;
	lastFixAt: Date | null;
	lastSeenAt: Date | null;
	hasOpenIncident: boolean;
}

export interface DashboardFleetVehicle {
	id: string;
	plateNo: string;
	make: string;
	model: string;
	device: { id: string; label: string; lastSeenAt: Date | null } | null;
}

export type DashboardActivity =
	| {
			kind: "incident";
			key: string;
			at: Date;
			action: string;
			incidentId: string;
			plateNo: string;
	  }
	| {
			kind: "device";
			key: string;
			at: Date;
			type: string;
			deviceLabel: string;
			plateNo: string | null;
			vehicleId: string | null;
	  };

export interface DashboardData {
	kpis: {
		openIncidents: number;
		awaitingAcknowledgement: number;
		oldestAwaitingAt: Date | null;
		approvedTrackers: number;
		onlineTrackers: number;
		lowBattery: number;
		alerts24h: number;
		averageAcknowledgementMs: number | null;
	};
	queue: DashboardQueueIncident[];
	queueTotal: number;
	map: DashboardMapVehicle[];
	fleet: DashboardFleetVehicle[];
	activity: DashboardActivity[];
	trend: {
		days: TrendBucket[];
		total: number;
		falseAlarms: number;
		cancelled: number;
	};
	now: Date;
}

/**
 * One dashboard load. Every filter starts from the organisation and, for a
 * vehicle owner, from the owned-vehicle relation, so no panel can widen the
 * scope on its own.
 */
export async function loadDashboardData(
	scope: DashboardScope,
	now = new Date(),
): Promise<DashboardData> {
	const ownedRelation = scope.role === "USER" ? { vehicle: { is: { ownerId: scope.userId } } } : {};
	const vehicleWhere = vehicleScope(scope.role, scope.orgId, scope.userId);
	const onlineCutoff = minutesAgo(DEVICE_OFFLINE_AFTER_MIN, now);
	const alertsCutoff = new Date(now.getTime() - DAY_MS);
	const acknowledgementCutoff = new Date(now.getTime() - 30 * DAY_MS);
	const activityCutoff = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);
	const trendDays = lastManilaDays(now);
	const trendStart = trendDays[0] ?? manilaDayStart(now);

	const [
		openIncidents,
		openIncidentVehicles,
		queue,
		queueTotal,
		approvedTrackers,
		onlineTrackers,
		lowBattery,
		alerts24h,
		acknowledgements,
		mapDevices,
		fleetVehicles,
		trendIncidents,
		auditRows,
		deviceEvents,
	] = await Promise.all([
		prisma.impactEvent.count({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				status: { in: ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED"] },
			},
		}),
		prisma.impactEvent.findMany({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				status: { in: ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED"] },
			},
			select: { vehicleId: true },
			distinct: ["vehicleId"],
		}),
		prisma.impactEvent.findMany({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				status: { in: ["SUSPECTED", "CONFIRMED"] },
			},
			orderBy: { detectedAt: "asc" },
			take: 6,
			select: {
				id: true,
				status: true,
				detectedAt: true,
				peakAccelG: true,
				tiltDeg: true,
				vehicle: { select: { id: true, plateNo: true, driverName: true } },
			},
		}),
		prisma.impactEvent.count({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				status: { in: ["SUSPECTED", "CONFIRMED"] },
			},
		}),
		prisma.trackerDevice.count({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				approvalStatus: "APPROVED",
			},
		}),
		prisma.trackerDevice.count({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				approvalStatus: "APPROVED",
				lastSeenAt: { gte: onlineCutoff },
			},
		}),
		prisma.trackerDevice.count({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				approvalStatus: "APPROVED",
				batteryV: { lt: LOW_BATTERY_V },
			},
		}),
		prisma.alertDelivery.count({
			where: {
				createdAt: { gte: alertsCutoff },
				impact: { orgId: scope.orgId, ...ownedRelation },
			},
		}),
		prisma.auditLog.findMany({
			where: {
				orgId: scope.orgId,
				action: "incident.acknowledged",
				target: { not: null },
				createdAt: { gte: acknowledgementCutoff },
			},
			orderBy: { createdAt: "desc" },
			take: 500,
			select: { target: true, createdAt: true },
		}),
		prisma.trackerDevice.findMany({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				approvalStatus: "APPROVED",
				vehicleId: { not: null },
				lastLat: { not: null },
				lastLng: { not: null },
			},
			select: {
				id: true,
				label: true,
				lastLat: true,
				lastLng: true,
				lastFixAt: true,
				lastSeenAt: true,
				vehicle: { select: { id: true, plateNo: true, driverName: true } },
			},
		}),
		prisma.vehicle.findMany({
			where: vehicleWhere,
			orderBy: { plateNo: "asc" },
			take: 8,
			select: {
				id: true,
				plateNo: true,
				make: true,
				model: true,
				devices: {
					orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } },
					take: 1,
					select: { id: true, label: true, lastSeenAt: true },
				},
			},
		}),
		prisma.impactEvent.findMany({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				detectedAt: { gte: trendStart },
			},
			select: { detectedAt: true, status: true },
		}),
		prisma.auditLog.findMany({
			where: {
				orgId: scope.orgId,
				action: { startsWith: "incident." },
				createdAt: { gte: activityCutoff },
			},
			orderBy: { createdAt: "desc" },
			take: 12,
			select: { id: true, action: true, target: true, createdAt: true },
		}),
		prisma.deviceStateEvent.findMany({
			where: {
				// Heartbeats arrive every 30 s and would crowd out every other event.
				type: { not: "HEARTBEAT" },
				device: { is: { orgId: scope.orgId, ...ownedRelation } },
			},
			orderBy: { createdAt: "desc" },
			take: ACTIVITY_LIMIT,
			select: {
				id: true,
				type: true,
				createdAt: true,
				device: {
					select: {
						label: true,
						vehicle: { select: { id: true, plateNo: true } },
					},
				},
			},
		}),
	]);

	const ackTargetIds = [
		...new Set(
			acknowledgements
				.map((row) => row.target)
				.filter((target): target is string => typeof target === "string"),
		),
	];
	const ackIncidents =
		ackTargetIds.length > 0
			? await prisma.impactEvent.findMany({
					where: { id: { in: ackTargetIds }, orgId: scope.orgId, ...ownedRelation },
					select: { id: true, detectedAt: true },
				})
			: [];
	const detectedAtById = new Map(
		ackIncidents.map((incident) => [incident.id, incident.detectedAt]),
	);

	const acknowledgementSamples: AcknowledgementSample[] = [];
	const seenTargets = new Set<string>();
	for (const row of acknowledgements) {
		if (!row.target || seenTargets.has(row.target)) continue;
		const detectedAt = detectedAtById.get(row.target);
		if (!detectedAt) continue;
		seenTargets.add(row.target);
		acknowledgementSamples.push({ detectedAt, acknowledgedAt: row.createdAt });
	}

	const openVehicleIds = new Set(openIncidentVehicles.map((incident) => incident.vehicleId));
	const map: DashboardMapVehicle[] = [];
	for (const device of mapDevices) {
		if (!device.vehicle || device.lastLat == null || device.lastLng == null) continue;
		if (!isValidCoordinate(device.lastLat, device.lastLng)) continue;
		map.push({
			vehicleId: device.vehicle.id,
			plateNo: device.vehicle.plateNo,
			driverName: device.vehicle.driverName,
			deviceId: device.id,
			deviceLabel: device.label,
			lat: device.lastLat,
			lng: device.lastLng,
			lastFixAt: device.lastFixAt,
			lastSeenAt: device.lastSeenAt,
			hasOpenIncident: openVehicleIds.has(device.vehicle.id),
		});
	}

	const auditTargets = [
		...new Set(
			auditRows
				.map((row) => row.target)
				.filter((target): target is string => typeof target === "string"),
		),
	];
	const auditIncidents =
		auditTargets.length > 0
			? await prisma.impactEvent.findMany({
					where: { id: { in: auditTargets }, orgId: scope.orgId, ...ownedRelation },
					select: { id: true, vehicle: { select: { plateNo: true } } },
				})
			: [];
	const plateByIncidentId = new Map(
		auditIncidents.map((incident) => [incident.id, incident.vehicle.plateNo]),
	);

	const activity: DashboardActivity[] = [];
	for (const row of auditRows) {
		if (!row.target) continue;
		const plateNo = plateByIncidentId.get(row.target);
		if (!plateNo) continue;
		activity.push({
			kind: "incident",
			key: `audit-${row.id}`,
			at: row.createdAt,
			action: row.action,
			incidentId: row.target,
			plateNo,
		});
	}
	for (const event of deviceEvents) {
		activity.push({
			kind: "device",
			key: `device-${event.id}`,
			at: event.createdAt,
			type: event.type,
			deviceLabel: event.device.label,
			plateNo: event.device.vehicle?.plateNo ?? null,
			vehicleId: event.device.vehicle?.id ?? null,
		});
	}
	activity.sort((a, b) => b.at.getTime() - a.at.getTime());

	const days = bucketByManilaDay(
		trendIncidents.map((incident) => incident.detectedAt),
		trendDays,
	);

	return {
		kpis: {
			openIncidents,
			awaitingAcknowledgement: queueTotal,
			oldestAwaitingAt: queue[0]?.detectedAt ?? null,
			approvedTrackers,
			onlineTrackers,
			lowBattery,
			alerts24h,
			averageAcknowledgementMs: averageAcknowledgementMs(acknowledgementSamples),
		},
		queue,
		queueTotal,
		map,
		fleet: fleetVehicles.map((vehicle) => ({
			id: vehicle.id,
			plateNo: vehicle.plateNo,
			make: vehicle.make,
			model: vehicle.model,
			device: vehicle.devices[0] ?? null,
		})),
		activity: activity.slice(0, ACTIVITY_LIMIT),
		trend: {
			days,
			total: days.reduce((sum, day) => sum + day.count, 0),
			falseAlarms: trendIncidents.filter((incident) => incident.status === "FALSE_ALARM").length,
			cancelled: trendIncidents.filter((incident) => incident.status === "CANCELLED").length,
		},
		now,
	};
}
