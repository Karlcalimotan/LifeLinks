import type { Prisma } from "@prisma/client";

/**
 * Explicit field list for the incident detail page. It carries the incident,
 * the vehicle identity needed for contact, the tracker label and the alert
 * delivery log, never a device token or a user password hash.
 * `lib/security/admin-payload.test.ts` guards this select.
 */
export const INCIDENT_DETAIL_SELECT = {
	id: true,
	orgId: true,
	deviceId: true,
	vehicleId: true,
	tripId: true,
	clientIncidentId: true,
	detectedAt: true,
	sentAt: true,
	peakAccelG: true,
	tiltDeg: true,
	vibrationCount: true,
	speedKph: true,
	lat: true,
	lng: true,
	gpsAgeS: true,
	status: true,
	cancelDeadline: true,
	cancelledAt: true,
	cancelRequestedAt: true,
	ackRequestedAt: true,
	resolvedAt: true,
	resolution: true,
	evidence: true,
	createdAt: true,
	updatedAt: true,
	vehicle: { select: { plateNo: true, driverName: true, driverPhone: true } },
	device: { select: { label: true } },
	alerts: {
		select: { id: true, channel: true, target: true, status: true, attempts: true },
		orderBy: { createdAt: "asc" },
	},
} satisfies Prisma.ImpactEventSelect;
