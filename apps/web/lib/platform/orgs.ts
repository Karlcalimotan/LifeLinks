import type { OrganizationStatus, Prisma } from "@prisma/client";

/**
 * Explicit field list for the platform organization list. The platform console
 * is an admin surface, but it still never needs a password hash, a device
 * token, an invitation hash or a push key. `lib/security/admin-payload.test.ts`
 * fails if a forbidden field is added here.
 */
export const PLATFORM_ORG_LIST_SELECT = {
	id: true,
	name: true,
	slug: true,
	status: true,
	createdAt: true,
	suspendedAt: true,
	suspendedReason: true,
	suspendedBy: true,
	memberships: { select: { revokedAt: true } },
} satisfies Prisma.OrganizationSelect;

export type PlatformOrgRow = Prisma.OrganizationGetPayload<{
	select: typeof PLATFORM_ORG_LIST_SELECT;
}>;

export interface PlatformOrgListItem {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
	createdAt: Date;
	suspendedAt: Date | null;
	suspendedReason: string | null;
	suspendedBy: string | null;
	activeMembers: number;
}

/** Copy only the listed fields; never spread a Prisma row into a payload. */
export function toPlatformOrgListItem(row: PlatformOrgRow): PlatformOrgListItem {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		status: row.status,
		createdAt: row.createdAt,
		suspendedAt: row.suspendedAt,
		suspendedReason: row.suspendedReason,
		suspendedBy: row.suspendedBy,
		activeMembers: row.memberships.filter((membership) => membership.revokedAt === null).length,
	};
}

export const PLATFORM_ORG_SUSPENDED = "platform.org_suspended";
export const PLATFORM_ORG_REINSTATED = "platform.org_reinstated";

export const PLATFORM_AUDIT_ACTIONS = [PLATFORM_ORG_SUSPENDED, PLATFORM_ORG_REINSTATED] as const;

export type PlatformAuditAction = (typeof PLATFORM_AUDIT_ACTIONS)[number];

/** Read `metadata.reason` without trusting the Json column's shape. */
export function auditReason(metadata: Prisma.JsonValue): string | null {
	if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
	const reason = (metadata as Record<string, unknown>).reason;
	return typeof reason === "string" && reason.trim().length > 0 ? reason : null;
}
