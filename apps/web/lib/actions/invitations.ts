"use server";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { MemberRoleName } from "@/lib/auth/roles";
import { passwordSchema } from "@/lib/auth/schemas";
import { canAdminister, createSession, requireUser } from "@/lib/auth/session";
import {
	generateInvitationToken,
	hashInvitationToken,
	invitationExpiresAt,
	inviteUrl,
	isInvitationTokenShape,
	isInvitationUsable,
} from "@/lib/invitations/token";
import prisma from "@/lib/prisma";
import { resolveSiteUrl } from "@/lib/site-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * Member invitations, acceptance, soft revocation and re-invite.
 *
 * There is no email provider in this deployment. An invitation produces a
 * copyable link and says so; nothing here claims an email was sent. The token
 * is returned once, in the action result, and never written to a log, an audit
 * row or the database.
 */

function localeFrom(formData: FormData): string {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

function value(formData: FormData, key: string): string {
	return String(formData.get(key) ?? "").trim();
}

const inviteSchema = z.object({
	email: z.string().trim().toLowerCase().email(),
	role: z.enum(["USER", "RESPONDER", "ADMIN"]),
});

const roleSchema = z.enum(["USER", "RESPONDER", "ADMIN"]);
const nameSchema = z.string().trim().min(2).max(120);

export type InvitationError = "forbidden" | "invalid" | "exists";

export interface InvitationState {
	ok: boolean;
	error?: InvitationError;
	email?: string;
	role?: MemberRoleName;
	inviteUrl?: string;
	expiresAt?: string;
	/** Delivery is always the copied link: no email sender is configured. */
	delivery?: "link";
}

export type ReinviteError = "forbidden" | "invalid" | "notfound" | "active";

export interface ReinviteState {
	ok: boolean;
	error?: ReinviteError;
	email?: string;
	role?: MemberRoleName;
	inviteUrl?: string;
	expiresAt?: string;
	delivery?: "link";
}

export type AcceptError = "invalid" | "name" | "password" | "mismatch";

export interface AcceptState {
	ok: boolean;
	error?: AcceptError;
}

function mintedInvitation(
	locale: string,
	token: string,
	expiresAt: Date,
): { inviteUrl: string; expiresAt: string; delivery: "link" } {
	return {
		inviteUrl: inviteUrl(resolveSiteUrl(), locale, token),
		expiresAt: expiresAt.toISOString(),
		delivery: "link",
	};
}

/**
 * Mint an invitation. ADMIN only, and an ADMIN invite is the same gate: there
 * is no path where a non-admin creates a member, let alone an admin one. The
 * role is recorded in the audit row so an admin invite is distinguishable.
 */
export async function createInvitationAction(
	_previous: InvitationState,
	formData: FormData,
): Promise<InvitationState> {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role) || !current.permissions["members.manage"]) {
		return { ok: false, error: "forbidden" };
	}

	const parsed = inviteSchema.safeParse({
		email: value(formData, "email"),
		role: value(formData, "role") || "USER",
	});
	if (!parsed.success) return { ok: false, error: "invalid" };

	const { email, role } = parsed.data;

	// An active membership already has access. A revoked one is handled by
	// re-invite, which resets the overlay instead of leaving stale overrides.
	const activeMember = await prisma.membership.findFirst({
		where: { orgId: current.org.id, revokedAt: null, user: { email } },
		select: { id: true },
	});
	if (activeMember) return { ok: false, error: "exists", email, role };

	const token = generateInvitationToken();
	const expiresAt = invitationExpiresAt();
	const now = new Date();

	await prisma.$transaction(async (tx) => {
		// One live invitation per email per organization: a newer link
		// supersedes every older one, so a leaked old link stops working.
		await tx.invitationToken.updateMany({
			where: { orgId: current.org.id, email, usedAt: null },
			data: { usedAt: now },
		});
		const invitation = await tx.invitationToken.create({
			data: {
				orgId: current.org.id,
				email,
				role,
				tokenHash: hashInvitationToken(token),
				expiresAt,
				createdById: current.user.id,
			},
			select: { id: true },
		});
		await tx.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "member.invited",
				target: email,
				metadata: {
					role,
					email,
					inviteId: invitation.id,
					expiresAt: expiresAt.toISOString(),
				},
			},
		});
	});

	revalidatePath(`/${locale}/settings`);
	return {
		ok: true,
		email,
		role,
		...mintedInvitation(locale, token, expiresAt),
	};
}

/**
 * Accept an invitation. Public by design: the token is the capability. Every
 * unusable token (unknown, used, expired) returns the same generic error, so
 * the page never confirms which of those applied.
 *
 * The organization must be ACTIVE. A suspended organization returns the same
 * generic invalid error and the token is not consumed, so it can be used again
 * if the organization is reinstated before the token expires. An existing
 * account is attached only when the invitee proves its password: holding the
 * link is not enough to take over an account.
 */
export async function acceptInvitationAction(
	_previous: AcceptState,
	formData: FormData,
): Promise<AcceptState> {
	const locale = localeFrom(formData);
	const token = value(formData, "token");
	if (!isInvitationTokenShape(token)) return { ok: false, error: "invalid" };

	const invitation = await prisma.invitationToken.findUnique({
		where: { tokenHash: hashInvitationToken(token) },
		include: { org: { select: { id: true, status: true } } },
	});
	if (
		!invitation ||
		!invitation.org ||
		invitation.org.status !== "ACTIVE" ||
		!isInvitationUsable(invitation)
	) {
		return { ok: false, error: "invalid" };
	}

	const parsedName = nameSchema.safeParse(value(formData, "name"));
	if (!parsedName.success) return { ok: false, error: "name" };
	const parsedPassword = passwordSchema.safeParse(String(formData.get("password") ?? ""));
	if (!parsedPassword.success) return { ok: false, error: "password" };
	if (String(formData.get("confirmPassword") ?? "") !== parsedPassword.data) {
		return { ok: false, error: "mismatch" };
	}

	const existingUser = await prisma.user.findUnique({
		where: { email: invitation.email },
		select: { id: true, name: true, passwordHash: true },
	});
	if (existingUser) {
		const passwordOk = await verifyPassword(parsedPassword.data, existingUser.passwordHash);
		if (!passwordOk) return { ok: false, error: "invalid" };

		const activeMembership = await prisma.membership.findFirst({
			where: { orgId: invitation.orgId, userId: existingUser.id, revokedAt: null },
			select: { id: true },
		});
		if (activeMembership) return { ok: false, error: "invalid" };
	}

	const passwordHash = await hashPassword(parsedPassword.data);
	const displayName = existingUser?.name ?? parsedName.data;
	const now = new Date();

	const accepted = await prisma.$transaction(async (tx) => {
		// Claim the token in the same write that consumes it. A second accept,
		// even with the same link, sees zero rows and fails.
		const claimed = await tx.invitationToken.updateMany({
			where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } },
			data: { usedAt: now },
		});
		if (claimed.count !== 1) return null;

		const user =
			existingUser ??
			(await tx.user.create({
				data: {
					email: invitation.email,
					name: displayName,
					passwordHash,
				},
				select: { id: true, name: true },
			}));

		const membership = await tx.membership.findUnique({
			where: { orgId_userId: { orgId: invitation.orgId, userId: user.id } },
			select: { id: true, revokedAt: true },
		});

		// Re-check inside the transaction: an invite must never change the role
		// of a membership that became active after the pre-check.
		if (membership && membership.revokedAt === null) return null;

		if (membership) {
			// A re-invited member returns with the role on the invitation and
			// no stale overrides.
			await tx.membershipPermission.deleteMany({ where: { membershipId: membership.id } });
			await tx.membership.update({
				where: { id: membership.id },
				data: {
					role: invitation.role,
					revokedAt: null,
					invitedBy: invitation.createdById,
				},
			});
		} else {
			await tx.membership.create({
				data: {
					orgId: invitation.orgId,
					userId: user.id,
					role: invitation.role,
					invitedBy: invitation.createdById,
				},
			});
		}

		await tx.auditLog.create({
			data: {
				orgId: invitation.orgId,
				actorId: user.id,
				action: "member.invite_accepted",
				target: invitation.email,
				metadata: {
					role: invitation.role,
					inviteId: invitation.id,
					invitedBy: invitation.createdById,
				},
			},
		});

		return { userId: user.id, name: user.name, role: invitation.role };
	});

	if (!accepted) return { ok: false, error: "invalid" };

	await createSession({
		sub: accepted.userId,
		orgId: invitation.orgId,
		role: accepted.role,
		email: invitation.email,
		name: accepted.name,
	});
	revalidatePath(`/${locale}/settings`);
	redirect(`/${locale}/dashboard`);
}

/**
 * Soft-revoke a membership. `getCurrentUser` re-reads the membership on every
 * request, so the revoked member loses access on their next request. Their
 * push subscriptions are removed in the same transaction so alerts stop
 * reaching a device the person still holds.
 */
export async function revokeMemberAction(formData: FormData): Promise<void> {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role) || !current.permissions["members.manage"]) {
		redirect(`/${locale}/settings?tab=members&error=forbidden`);
	}

	const membershipId = value(formData, "membershipId");
	const membership = await prisma.membership.findFirst({
		where: { id: membershipId, orgId: current.org.id },
		include: { user: { select: { id: true, email: true } } },
	});
	if (!membership) redirect(`/${locale}/settings?tab=members&error=notfound`);
	if (membership.userId === current.user.id) {
		redirect(`/${locale}/settings?tab=members&error=self`);
	}
	if (membership.revokedAt) {
		redirect(`/${locale}/settings?tab=members&error=already`);
	}
	if (membership.role === "ADMIN") {
		const activeAdmins = await prisma.membership.count({
			where: { orgId: current.org.id, role: "ADMIN", revokedAt: null },
		});
		if (activeAdmins <= 1) {
			redirect(`/${locale}/settings?tab=members&error=last_admin`);
		}
	}

	const now = new Date();
	await prisma.$transaction([
		prisma.membership.update({ where: { id: membership.id }, data: { revokedAt: now } }),
		prisma.invitationToken.updateMany({
			where: { orgId: current.org.id, email: membership.user.email, usedAt: null },
			data: { usedAt: now },
		}),
		prisma.pushSubscription.deleteMany({
			where: { orgId: current.org.id, userId: membership.userId },
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "member.revoked",
				target: membership.id,
				metadata: {
					userId: membership.userId,
					email: membership.user.email,
					role: membership.role,
				},
			},
		}),
	]);

	revalidatePath(`/${locale}/settings`);
	redirect(`/${locale}/settings?tab=members&revoked=1`);
}

/**
 * Re-invite a revoked member. The stale overrides are deleted so the member
 * returns to the role defaults, the role is reset to the chosen one, and every
 * outstanding token for the email is invalidated before the new one is minted.
 * The membership stays revoked until the new link is accepted.
 */
export async function reinviteMemberAction(
	_previous: ReinviteState,
	formData: FormData,
): Promise<ReinviteState> {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role) || !current.permissions["members.manage"]) {
		return { ok: false, error: "forbidden" };
	}

	const membershipId = value(formData, "membershipId");
	const membership = await prisma.membership.findFirst({
		where: { id: membershipId, orgId: current.org.id },
		include: { user: { select: { id: true, email: true } } },
	});
	if (!membership) return { ok: false, error: "notfound" };
	if (membership.revokedAt == null) return { ok: false, error: "active" };

	const requestedRole = value(formData, "role");
	const parsedRole = roleSchema.safeParse(requestedRole || membership.role);
	if (!parsedRole.success) return { ok: false, error: "invalid" };
	const role: MemberRoleName = parsedRole.data;

	const token = generateInvitationToken();
	const expiresAt = invitationExpiresAt();
	const now = new Date();

	await prisma.$transaction(async (tx) => {
		await tx.membershipPermission.deleteMany({ where: { membershipId: membership.id } });
		await tx.membership.update({
			where: { id: membership.id },
			data: { role, invitedBy: current.user.id },
		});
		await tx.invitationToken.updateMany({
			where: { orgId: current.org.id, email: membership.user.email, usedAt: null },
			data: { usedAt: now },
		});
		const invitation = await tx.invitationToken.create({
			data: {
				orgId: current.org.id,
				email: membership.user.email,
				role,
				tokenHash: hashInvitationToken(token),
				expiresAt,
				createdById: current.user.id,
			},
			select: { id: true },
		});
		await tx.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "member.reinvited",
				target: membership.id,
				metadata: {
					email: membership.user.email,
					role,
					previousRole: membership.role,
					inviteId: invitation.id,
					expiresAt: expiresAt.toISOString(),
				},
			},
		});
	});

	revalidatePath(`/${locale}/settings`);
	return {
		ok: true,
		email: membership.user.email,
		role,
		...mintedInvitation(locale, token, expiresAt),
	};
}
