import type { DeviceApproval, Prisma } from "@prisma/client";

/**
 * Explicit field list for the tenant admin tracker list. The page previously
 * used `include`, which put `tokenHash` on the server component's data even
 * though it was not rendered. The list never needs the hash, so it is not
 * selected. `lib/security/admin-payload.test.ts` guards this list.
 */
export const ADMIN_DEVICE_LIST_SELECT = {
	id: true,
	label: true,
	mac: true,
	approvalStatus: true,
	lastSeenAt: true,
	rssiDbm: true,
	batteryV: true,
	firmwareVersion: true,
	vehicle: { select: { plateNo: true } },
} satisfies Prisma.TrackerDeviceSelect;

export type AdminDeviceListRow = Prisma.TrackerDeviceGetPayload<{
	select: typeof ADMIN_DEVICE_LIST_SELECT;
}>;

export interface AdminDeviceListItem {
	id: string;
	label: string;
	mac: string;
	approvalStatus: DeviceApproval;
	lastSeenAt: Date | null;
	rssiDbm: number | null;
	batteryV: number | null;
	firmwareVersion: string | null;
	vehicle: { plateNo: string } | null;
}

/** Copy only the listed fields; never spread a Prisma row into a payload. */
export function toAdminDeviceListItem(row: AdminDeviceListRow): AdminDeviceListItem {
	return {
		id: row.id,
		label: row.label,
		mac: row.mac,
		approvalStatus: row.approvalStatus,
		lastSeenAt: row.lastSeenAt,
		rssiDbm: row.rssiDbm,
		batteryV: row.batteryV,
		firmwareVersion: row.firmwareVersion,
		vehicle: row.vehicle ? { plateNo: row.vehicle.plateNo } : null,
	};
}
