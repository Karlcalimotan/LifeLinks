/**
 * LifeLink has exactly three roles:
 *
 * - USER      the vehicle owner; sees and manages only their own vehicles
 * - RESPONDER CDRRMO / Pulis; sees the whole fleet and works incidents
 * - ADMIN     manages members, trackers, settings and the whole fleet
 *
 * This module is deliberately free of server-only imports so the permission
 * rules can be unit-tested.
 */
export type MemberRoleName = "USER" | "RESPONDER" | "ADMIN";

export const MEMBER_ROLES: readonly MemberRoleName[] = ["USER", "RESPONDER", "ADMIN"];

export function isMemberRole(value: unknown): value is MemberRoleName {
	return typeof value === "string" && (MEMBER_ROLES as readonly string[]).includes(value);
}

export interface VehicleScope {
	orgId: string;
	ownerId?: string;
}

/** A vehicle owner is scoped to their own rows; responders and admins see the org. */
export function vehicleScope(role: MemberRoleName, orgId: string, userId: string): VehicleScope {
	return role === "USER" ? { orgId, ownerId: userId } : { orgId };
}

/** The relation filter for models that reach ownership through `vehicle`. */
export function vehicleRelationScope(role: MemberRoleName, userId: string): { ownerId?: string } {
	return role === "USER" ? { ownerId: userId } : {};
}

/**
 * Incident workflow is shared. The caller still has to prove that the incident
 * belongs to the user's scope before mutating it.
 */
export function canManageIncidents(_role: MemberRoleName): boolean {
	return true;
}

export function canAdminister(role: MemberRoleName): boolean {
	return role === "ADMIN";
}

export function canViewAllVehicles(role: MemberRoleName): boolean {
	return role !== "USER";
}

export function canViewDevices(role: MemberRoleName): boolean {
	return role === "ADMIN";
}

export function canManageSettings(role: MemberRoleName): boolean {
	return role === "ADMIN";
}

export function roleLabelKey(role: MemberRoleName): "user" | "responder" | "admin" {
	switch (role) {
		case "RESPONDER":
			return "responder";
		case "ADMIN":
			return "admin";
		default:
			return "user";
	}
}
