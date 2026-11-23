import type { Prisma } from "@prisma/client";

/**
 * Explicit field list for the tenant member list. The list needs identity and
 * membership state only; it never needs `passwordHash` or an invitation hash.
 * `lib/security/admin-payload.test.ts` guards this select.
 */
export const MEMBER_LIST_SELECT = {
	id: true,
	role: true,
	userId: true,
	createdAt: true,
	revokedAt: true,
	user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MembershipSelect;

export type MemberListRow = Prisma.MembershipGetPayload<{
	select: typeof MEMBER_LIST_SELECT;
}>;
