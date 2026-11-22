import "server-only";

import prisma from "@/lib/prisma";
import type { AwaitingNotifications } from "./notification-types";
import { type SearchScope, awaitingIncidentWhere } from "./scope";

const BELL_LIMIT = 5;

/**
 * The bell's count and its oldest-first preview. The count is a separate query
 * so it stays exact when the preview is truncated.
 */
export async function loadAwaitingIncidents(
	scope: SearchScope,
	take = BELL_LIMIT,
): Promise<AwaitingNotifications> {
	const where = awaitingIncidentWhere(scope);
	const [count, rows] = await Promise.all([
		prisma.impactEvent.count({ where }),
		prisma.impactEvent.findMany({
			where,
			orderBy: { detectedAt: "asc" },
			take,
			select: {
				id: true,
				status: true,
				detectedAt: true,
				vehicle: { select: { plateNo: true, driverName: true } },
			},
		}),
	]);

	return {
		count,
		items: rows.map((row) => ({
			id: row.id,
			plateNo: row.vehicle.plateNo,
			driverName: row.vehicle.driverName,
			status: row.status,
			detectedAt: row.detectedAt.toISOString(),
		})),
	};
}
