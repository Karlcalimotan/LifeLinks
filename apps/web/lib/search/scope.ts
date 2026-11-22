import type { MemberRoleName } from "@/lib/auth/roles";

/**
 * Search runs under the same scope as the console: one organisation, and for a
 * vehicle owner only rows that belong to their own vehicles. Nothing here reads
 * a client-supplied org or role.
 */
export interface SearchScope {
	role: MemberRoleName;
	orgId: string;
	userId: string;
}

export type OwnedVehicleRelation = { vehicle: { is: { ownerId: string } } } | Record<string, never>;

export function ownedVehicleRelation(role: MemberRoleName, userId: string): OwnedVehicleRelation {
	return role === "USER" ? { vehicle: { is: { ownerId: userId } } } : {};
}

export interface AwaitingIncidentWhere {
	orgId: string;
	vehicle?: { is: { ownerId: string } };
	status: { in: ("SUSPECTED" | "CONFIRMED")[] };
}

/**
 * The bell and the dashboard's awaiting-acknowledgement KPI must agree, so
 * both use this filter: suspected or confirmed, never acknowledged or closed.
 */
export function awaitingIncidentWhere(scope: SearchScope): AwaitingIncidentWhere {
	return {
		orgId: scope.orgId,
		...ownedVehicleRelation(scope.role, scope.userId),
		status: { in: ["SUSPECTED", "CONFIRMED"] },
	};
}

/** Tracker records are admin-only, matching the navigation and the pages. */
export function canSearchDevices(role: MemberRoleName): boolean {
	return role === "ADMIN";
}
