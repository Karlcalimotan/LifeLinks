/**
 * Membership lifecycle helpers.
 *
 * A membership is soft-revoked by setting `revokedAt`. The row keeps its role
 * and audit trail; every request path treats it as absent. Keeping the rule in
 * one predicate means the session, the login lookup and the members list agree.
 */
export interface MembershipLifecycle {
	revokedAt: Date | null;
}

export type MembershipStatus = "active" | "revoked";

export function isMembershipActive(membership: MembershipLifecycle): boolean {
	return membership.revokedAt == null;
}

export function membershipStatus(membership: MembershipLifecycle): MembershipStatus {
	return isMembershipActive(membership) ? "active" : "revoked";
}
