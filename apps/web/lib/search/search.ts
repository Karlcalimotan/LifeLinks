import "server-only";

import { vehicleScope } from "@/lib/auth/roles";
import prisma from "@/lib/prisma";
import { SEARCH_RESULT_LIMIT, parseSearchQuery, rankSearchResults } from "./query";
import { type SearchScope, canSearchDevices, ownedVehicleRelation } from "./scope";
import {
	type DeviceSearchRow,
	type IncidentSearchRow,
	type SearchResult,
	type VehicleSearchRow,
	deviceSearchResult,
	incidentSearchResult,
	vehicleSearchResult,
} from "./shape";

const PER_TYPE_LIMIT = 5;

/**
 * Three bounded queries, no N+1, one merged result list. The organisation and
 * owner filters are applied in the database, not in the response.
 */
export async function searchOrg(scope: SearchScope, rawQuery: string): Promise<SearchResult[]> {
	const query = parseSearchQuery(rawQuery);
	if (!query) return [];

	const mode = "insensitive" as const;
	const ownedRelation = ownedVehicleRelation(scope.role, scope.userId);

	const devices: Promise<DeviceSearchRow[]> = canSearchDevices(scope.role)
		? prisma.trackerDevice.findMany({
				where: {
					orgId: scope.orgId,
					OR: [{ label: { contains: query, mode } }, { mac: { contains: query, mode } }],
				},
				take: PER_TYPE_LIMIT,
				orderBy: { label: "asc" },
				select: {
					id: true,
					label: true,
					mac: true,
					approvalStatus: true,
					vehicle: { select: { plateNo: true } },
				},
			})
		: Promise.resolve([]);

	const [vehicles, incidents, deviceRows] = await Promise.all([
		prisma.vehicle.findMany({
			where: {
				...vehicleScope(scope.role, scope.orgId, scope.userId),
				OR: [
					{ plateNo: { contains: query, mode } },
					{ driverName: { contains: query, mode } },
					{ make: { contains: query, mode } },
					{ model: { contains: query, mode } },
				],
			},
			take: PER_TYPE_LIMIT,
			orderBy: { plateNo: "asc" },
			select: {
				id: true,
				plateNo: true,
				driverName: true,
				make: true,
				model: true,
			},
		}),
		prisma.impactEvent.findMany({
			where: {
				orgId: scope.orgId,
				...ownedRelation,
				OR: [
					{ id: { contains: query, mode } },
					{ clientIncidentId: { contains: query, mode } },
					{ vehicle: { is: { plateNo: { contains: query, mode } } } },
					{ vehicle: { is: { driverName: { contains: query, mode } } } },
				],
			},
			take: PER_TYPE_LIMIT,
			orderBy: { detectedAt: "desc" },
			select: {
				id: true,
				clientIncidentId: true,
				status: true,
				detectedAt: true,
				vehicle: { select: { plateNo: true } },
			},
		}),
		devices,
	]);

	const vehicleRows: VehicleSearchRow[] = vehicles;
	const incidentRows: IncidentSearchRow[] = incidents;

	return rankSearchResults(
		[
			...vehicleRows.map(vehicleSearchResult),
			...incidentRows.map(incidentSearchResult),
			...deviceRows.map(deviceSearchResult),
		],
		query,
		SEARCH_RESULT_LIMIT,
	);
}
