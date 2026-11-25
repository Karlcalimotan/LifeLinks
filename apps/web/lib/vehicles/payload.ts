import type { Prisma } from "@prisma/client";

/**
 * Explicit field lists for the vehicle pages and the live map. They need
 * tracker state and position, never the tracker's token hash.
 * `lib/security/admin-payload.test.ts` guards these selects.
 */
export const VEHICLE_LIST_SELECT = {
	id: true,
	plateNo: true,
	make: true,
	model: true,
	year: true,
	driverName: true,
	driverPhone: true,
	status: true,
	devices: {
		select: { id: true, label: true, mac: true, lastSeenAt: true },
		orderBy: { createdAt: "asc" },
		take: 1,
	},
	_count: { select: { impacts: true, trips: true } },
} satisfies Prisma.VehicleSelect;

export const VEHICLE_DETAIL_SELECT = {
	id: true,
	plateNo: true,
	make: true,
	model: true,
	year: true,
	vin: true,
	driverName: true,
	driverPhone: true,
	ownerId: true,
	status: true,
	devices: {
		select: {
			id: true,
			label: true,
			mac: true,
			firmwareVersion: true,
			configRev: true,
			lastSeenAt: true,
			lastLat: true,
			lastLng: true,
			lastFixAt: true,
			lastSpeedKph: true,
			batteryV: true,
			satellites: true,
			ignition: true,
		},
		orderBy: { createdAt: "asc" },
		take: 1,
	},
} satisfies Prisma.VehicleSelect;

export const MAP_VEHICLE_SELECT = {
	id: true,
	plateNo: true,
	make: true,
	model: true,
	year: true,
	driverName: true,
	driverPhone: true,
	devices: {
		select: {
			id: true,
			label: true,
			mac: true,
			approvalStatus: true,
			lastSeenAt: true,
			lastLat: true,
			lastLng: true,
			lastFixAt: true,
			lastSpeedKph: true,
			batteryV: true,
			rssiDbm: true,
			satellites: true,
		},
	},
} satisfies Prisma.VehicleSelect;
