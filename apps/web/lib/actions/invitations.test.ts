import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	$transaction: vi.fn(),
	invitationToken: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
	membership: {
		findFirst: vi.fn(),
		findUnique: vi.fn(),
		update: vi.fn(),
		create: vi.fn(),
		count: vi.fn(),
	},
	membershipPermission: { deleteMany: vi.fn() },
	user: { findUnique: vi.fn(), create: vi.fn() },
	pushSubscription: { deleteMany: vi.fn() },
	auditLog: { create: vi.fn() },
	requireUser: vi.fn(),
	canAdminister: vi.fn(),
	createSession: vi.fn(),
	hashPassword: vi.fn(),
	verifyPassword: vi.fn(),
	revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		$transaction: mocks.$transaction,
		invitationToken: mocks.invitationToken,
		membership: mocks.membership,
		membershipPermission: mocks.membershipPermission,
		user: mocks.user,
		pushSubscription: mocks.pushSubscription,
		auditLog: mocks.auditLog,
	},
}));

vi.mock("@/lib/auth/session", () => ({
	requireUser: mocks.requireUser,
	canAdminister: mocks.canAdminister,
	createSession: mocks.createSession,
}));

vi.mock("@/lib/auth/password", () => ({
	hashPassword: mocks.hashPassword,
	verifyPassword: mocks.verifyPassword,
}));

vi.mock("next/cache", () => ({
	revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`);
	},
}));

import { rolePermissionDefaults } from "@/lib/auth/permissions";
import type { MemberRoleName } from "@/lib/auth/roles";
import { generateInvitationToken, hashInvitationToken } from "@/lib/invitations/token";
import {
	acceptInvitationAction,
	createInvitationAction,
	reinviteMemberAction,
	revokeMemberAction,
} from "./invitations";

function current(role: MemberRoleName, overrides: Record<string, boolean> = {}) {
	return {
		session: { sub: "admin-1", orgId: "org-1", role, email: "admin@example.test", name: "Admin" },
		user: { id: "admin-1", email: "admin@example.test", name: "Admin" },
		org: { id: "org-1", name: "Org", slug: "org" },
		role,
		permissions: { ...rolePermissionDefaults(role), ...overrides },
	};
}

function inviteForm(values: { email?: string; role?: string } = {}): FormData {
	const data = new FormData();
	data.set("locale", "en");
	data.set("email", values.email ?? "new@example.test");
	data.set("role", values.role ?? "USER");
	return data;
}

function revokeForm(membershipId = "membership-1"): FormData {
	const data = new FormData();
	data.set("locale", "en");
	data.set("membershipId", membershipId);
	return data;
}

function reinviteForm(values: { membershipId?: string; role?: string } = {}): FormData {
	const data = new FormData();
	data.set("locale", "en");
	data.set("membershipId", values.membershipId ?? "membership-1");
	if (values.role) data.set("role", values.role);
	return data;
}

function tokenFrom(state: { inviteUrl?: string }): string {
	const match = state.inviteUrl?.match(/\/invite\/([A-Za-z0-9_-]{43})$/);
	if (!match?.[1]) throw new Error(`no token in ${state.inviteUrl}`);
	return match[1];
}

async function catchRedirect(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
		throw new Error("expected a redirect");
	} catch (error) {
		if (!(error instanceof Error) || !error.message.startsWith("redirect:")) throw error;
		return error.message.slice("redirect:".length);
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue(current("ADMIN"));
	mocks.canAdminister.mockImplementation((role: MemberRoleName) => role === "ADMIN");
	mocks.hashPassword.mockResolvedValue("bcrypt-hash");
	mocks.verifyPassword.mockResolvedValue(true);
	mocks.createSession.mockResolvedValue(undefined);
	mocks.revalidatePath.mockReturnValue(undefined);
	mocks.invitationToken.updateMany.mockResolvedValue({ count: 1 });
	mocks.invitationToken.create.mockResolvedValue({ id: "invitation-1" });
	mocks.membership.findFirst.mockResolvedValue(null);
	mocks.membership.findUnique.mockResolvedValue(null);
	mocks.membership.update.mockResolvedValue({});
	mocks.membership.create.mockResolvedValue({});
	mocks.membership.count.mockResolvedValue(1);
	mocks.membershipPermission.deleteMany.mockResolvedValue({ count: 0 });
	mocks.user.findUnique.mockResolvedValue(null);
	mocks.user.create.mockResolvedValue({ id: "user-9", name: "Ana Cruz" });
	mocks.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
	mocks.auditLog.create.mockResolvedValue({});
	mocks.$transaction.mockImplementation(async (arg: unknown) => {
		if (typeof arg === "function") {
			return (arg as (tx: unknown) => Promise<unknown>)({
				invitationToken: mocks.invitationToken,
				membership: mocks.membership,
				membershipPermission: mocks.membershipPermission,
				user: mocks.user,
				pushSubscription: mocks.pushSubscription,
				auditLog: mocks.auditLog,
			});
		}
		return Promise.all(arg as Promise<unknown>[]);
	});
});

describe("createInvitationAction", () => {
	it("rejects a non-admin before touching the database", async () => {
		mocks.requireUser.mockResolvedValue(current("RESPONDER"));

		const state = await createInvitationAction({ ok: false }, inviteForm());

		expect(state).toEqual({ ok: false, error: "forbidden" });
		expect(mocks.membership.findFirst).not.toHaveBeenCalled();
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("only an admin can mint an admin invite", async () => {
		mocks.requireUser.mockResolvedValue(current("RESPONDER"));

		const state = await createInvitationAction({ ok: false }, inviteForm({ role: "ADMIN" }));

		expect(state).toEqual({ ok: false, error: "forbidden" });
		expect(mocks.invitationToken.create).not.toHaveBeenCalled();
	});

	it("stores only the token hash and returns a copyable link", async () => {
		const state = await createInvitationAction({ ok: false }, inviteForm());
		const token = tokenFrom(state);

		expect(state.ok).toBe(true);
		expect(state.email).toBe("new@example.test");
		expect(state.role).toBe("USER");
		expect(state.delivery).toBe("link");
		expect(state.inviteUrl).toMatch(/^http:\/\/localhost:3000\/en\/invite\/[A-Za-z0-9_-]{43}$/);

		const create = mocks.invitationToken.create.mock.calls[0]?.[0];
		expect(create.data).toMatchObject({
			orgId: "org-1",
			email: "new@example.test",
			role: "USER",
			createdById: "admin-1",
			tokenHash: hashInvitationToken(token),
		});
		expect(create.data.tokenHash).not.toBe(token);
		expect(create.data).not.toHaveProperty("token");
		expect(create.data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 24 * 60 * 60 * 1000);
	});

	it("invalidates every older open invitation for the same email and organization", async () => {
		await createInvitationAction({ ok: false }, inviteForm());

		expect(mocks.invitationToken.updateMany).toHaveBeenCalledWith({
			where: { orgId: "org-1", email: "new@example.test", usedAt: null },
			data: { usedAt: expect.any(Date) },
		});
	});

	it("audits the invite with the actor, target and role, never the token", async () => {
		const state = await createInvitationAction({ ok: false }, inviteForm({ role: "ADMIN" }));
		const token = tokenFrom(state);
		const audit = mocks.auditLog.create.mock.calls[0]?.[0]?.data;

		expect(audit).toMatchObject({
			orgId: "org-1",
			actorId: "admin-1",
			action: "member.invited",
			target: "new@example.test",
			metadata: {
				role: "ADMIN",
				email: "new@example.test",
				inviteId: "invitation-1",
			},
		});
		expect(JSON.stringify(audit)).not.toContain(token);
		expect(mocks.invitationToken.create.mock.calls[0]?.[0].data.role).toBe("ADMIN");
	});

	it("refuses to invite an email that is already an active member", async () => {
		mocks.membership.findFirst.mockResolvedValue({ id: "membership-1" });

		const state = await createInvitationAction({ ok: false }, inviteForm());

		expect(state).toEqual({
			ok: false,
			error: "exists",
			email: "new@example.test",
			role: "USER",
		});
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("rejects an invalid email or role without writing", async () => {
		const badEmail = await createInvitationAction({ ok: false }, inviteForm({ email: "nope" }));
		const badRole = await createInvitationAction({ ok: false }, inviteForm({ role: "OWNER" }));

		expect(badEmail.error).toBe("invalid");
		expect(badRole.error).toBe("invalid");
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});
});

describe("acceptInvitationAction", () => {
	const token = generateInvitationToken();

	function invitation(overrides: Record<string, unknown> = {}) {
		return {
			id: "invitation-1",
			orgId: "org-1",
			email: "invitee@example.test",
			role: "USER",
			tokenHash: hashInvitationToken(token),
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			usedAt: null,
			createdById: "admin-1",
			createdAt: new Date(),
			org: { id: "org-1", status: "ACTIVE" },
			...overrides,
		};
	}

	function acceptForm(values: Record<string, string> = {}): FormData {
		const data = new FormData();
		data.set("locale", "en");
		data.set("token", values.token ?? token);
		data.set("name", values.name ?? "Ana Cruz");
		data.set("password", values.password ?? "Secret123");
		data.set("confirmPassword", values.confirmPassword ?? "Secret123");
		return data;
	}

	beforeEach(() => {
		mocks.invitationToken.findUnique.mockResolvedValue(invitation());
	});

	it("looks the token up by hash, never by plaintext", async () => {
		await catchRedirect(() => acceptInvitationAction({ ok: false }, acceptForm()));

		expect(mocks.invitationToken.findUnique).toHaveBeenCalledWith({
			where: { tokenHash: hashInvitationToken(token) },
			include: { org: { select: { id: true, status: true } } },
		});
	});

	it("rejects an invitation into a suspended organization without consuming it", async () => {
		mocks.invitationToken.findUnique.mockResolvedValue(
			invitation({ org: { id: "org-1", status: "SUSPENDED" } }),
		);

		const state = await acceptInvitationAction({ ok: false }, acceptForm());

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.$transaction).not.toHaveBeenCalled();
		expect(mocks.invitationToken.updateMany).not.toHaveBeenCalled();
		expect(mocks.createSession).not.toHaveBeenCalled();
	});

	it("creates the user, the membership and the audit row, then signs in", async () => {
		const path = await catchRedirect(() => acceptInvitationAction({ ok: false }, acceptForm()));

		expect(path).toBe("/en/dashboard");
		expect(mocks.invitationToken.updateMany).toHaveBeenCalledWith({
			where: { id: "invitation-1", usedAt: null, expiresAt: { gt: expect.any(Date) } },
			data: { usedAt: expect.any(Date) },
		});
		expect(mocks.user.create).toHaveBeenCalledWith({
			data: {
				email: "invitee@example.test",
				name: "Ana Cruz",
				passwordHash: "bcrypt-hash",
			},
			select: { id: true, name: true },
		});
		expect(mocks.membership.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				userId: "user-9",
				role: "USER",
				invitedBy: "admin-1",
			},
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-9",
				action: "member.invite_accepted",
				target: "invitee@example.test",
				metadata: {
					role: "USER",
					inviteId: "invitation-1",
					invitedBy: "admin-1",
				},
			},
		});
		expect(mocks.createSession).toHaveBeenCalledWith({
			sub: "user-9",
			orgId: "org-1",
			role: "USER",
			email: "invitee@example.test",
			name: "Ana Cruz",
		});
	});

	it.each([
		["unknown", null],
		["already used", invitation({ usedAt: new Date() })],
		["expired", invitation({ expiresAt: new Date(Date.now() - 1000) })],
	])("rejects a %s token with one generic error", async (_label, record) => {
		mocks.invitationToken.findUnique.mockResolvedValue(record);

		const state = await acceptInvitationAction({ ok: false }, acceptForm());

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.$transaction).not.toHaveBeenCalled();
		expect(mocks.createSession).not.toHaveBeenCalled();
	});

	it("rejects a malformed token without a lookup", async () => {
		const state = await acceptInvitationAction({ ok: false }, acceptForm({ token: "short" }));

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.invitationToken.findUnique).not.toHaveBeenCalled();
	});

	it("validates the name, password and confirmation before writing", async () => {
		const shortName = await acceptInvitationAction({ ok: false }, acceptForm({ name: "A" }));
		const weakPassword = await acceptInvitationAction(
			{ ok: false },
			acceptForm({ password: "short", confirmPassword: "short" }),
		);
		const mismatch = await acceptInvitationAction(
			{ ok: false },
			acceptForm({ confirmPassword: "Different1" }),
		);

		expect(shortName.error).toBe("name");
		expect(weakPassword.error).toBe("password");
		expect(mismatch.error).toBe("mismatch");
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("requires the existing account's password before attaching it", async () => {
		mocks.user.findUnique.mockResolvedValue({
			id: "user-1",
			name: "Ana",
			passwordHash: "existing-hash",
		});
		mocks.verifyPassword.mockResolvedValue(false);

		const state = await acceptInvitationAction({ ok: false }, acceptForm());

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.verifyPassword).toHaveBeenCalledWith("Secret123", "existing-hash");
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("refuses to attach an existing account that is already an active member", async () => {
		mocks.user.findUnique.mockResolvedValue({
			id: "user-1",
			name: "Ana",
			passwordHash: "existing-hash",
		});
		mocks.membership.findFirst.mockResolvedValue({ id: "membership-1" });

		const state = await acceptInvitationAction({ ok: false }, acceptForm());

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("reinstates a re-invited membership and clears stale overrides", async () => {
		mocks.user.findUnique.mockResolvedValue({
			id: "user-1",
			name: "Ana",
			passwordHash: "existing-hash",
		});
		mocks.membership.findUnique.mockResolvedValue({
			id: "membership-1",
			revokedAt: new Date("2026-11-20T08:00:00.000Z"),
		});

		await catchRedirect(() => acceptInvitationAction({ ok: false }, acceptForm()));

		expect(mocks.user.create).not.toHaveBeenCalled();
		expect(mocks.membershipPermission.deleteMany).toHaveBeenCalledWith({
			where: { membershipId: "membership-1" },
		});
		expect(mocks.membership.update).toHaveBeenCalledWith({
			where: { id: "membership-1" },
			data: { role: "USER", revokedAt: null, invitedBy: "admin-1" },
		});
		expect(mocks.membership.create).not.toHaveBeenCalled();
	});

	it("re-checks an active membership inside the transaction", async () => {
		mocks.user.findUnique.mockResolvedValue({
			id: "user-1",
			name: "Ana",
			passwordHash: "existing-hash",
		});
		mocks.membership.findUnique.mockResolvedValue({
			id: "membership-1",
			revokedAt: null,
		});

		const state = await acceptInvitationAction({ ok: false }, acceptForm());

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.membership.update).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
		expect(mocks.createSession).not.toHaveBeenCalled();
	});

	it("does not accept twice when another request already claimed the token", async () => {
		mocks.invitationToken.updateMany.mockResolvedValue({ count: 0 });

		const state = await acceptInvitationAction({ ok: false }, acceptForm());

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.user.create).not.toHaveBeenCalled();
		expect(mocks.membership.create).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
		expect(mocks.createSession).not.toHaveBeenCalled();
	});
});

describe("revokeMemberAction", () => {
	function revokedMembership(overrides: Record<string, unknown> = {}) {
		return {
			id: "membership-1",
			orgId: "org-1",
			userId: "user-2",
			role: "USER",
			revokedAt: null,
			user: { id: "user-2", email: "member@example.test" },
			...overrides,
		};
	}

	beforeEach(() => {
		mocks.membership.findFirst.mockResolvedValue(revokedMembership());
	});

	it("is admin-only", async () => {
		mocks.requireUser.mockResolvedValue(current("RESPONDER"));

		const path = await catchRedirect(() => revokeMemberAction(revokeForm()));

		expect(path).toBe("/en/settings?tab=members&error=forbidden");
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("refuses to revoke the caller's own membership", async () => {
		mocks.membership.findFirst.mockResolvedValue(
			revokedMembership({
				userId: "admin-1",
				user: { id: "admin-1", email: "admin@example.test" },
			}),
		);

		const path = await catchRedirect(() => revokeMemberAction(revokeForm()));

		expect(path).toBe("/en/settings?tab=members&error=self");
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("refuses to revoke the last active admin", async () => {
		mocks.membership.findFirst.mockResolvedValue(revokedMembership({ role: "ADMIN" }));
		mocks.membership.count.mockResolvedValue(1);

		const path = await catchRedirect(() => revokeMemberAction(revokeForm()));

		expect(path).toBe("/en/settings?tab=members&error=last_admin");
		expect(mocks.membership.count).toHaveBeenCalledWith({
			where: { orgId: "org-1", role: "ADMIN", revokedAt: null },
		});
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("sets revokedAt, invalidates open invitations, drops push subscriptions and audits", async () => {
		const path = await catchRedirect(() => revokeMemberAction(revokeForm()));

		expect(path).toBe("/en/settings?tab=members&revoked=1");
		expect(mocks.membership.update).toHaveBeenCalledWith({
			where: { id: "membership-1" },
			data: { revokedAt: expect.any(Date) },
		});
		expect(mocks.invitationToken.updateMany).toHaveBeenCalledWith({
			where: { orgId: "org-1", email: "member@example.test", usedAt: null },
			data: { usedAt: expect.any(Date) },
		});
		expect(mocks.pushSubscription.deleteMany).toHaveBeenCalledWith({
			where: { orgId: "org-1", userId: "user-2" },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "admin-1",
				action: "member.revoked",
				target: "membership-1",
				metadata: { userId: "user-2", email: "member@example.test", role: "USER" },
			},
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/settings");
	});

	it("reports an already revoked membership instead of writing again", async () => {
		mocks.membership.findFirst.mockResolvedValue(
			revokedMembership({ revokedAt: new Date("2026-11-20T08:00:00.000Z") }),
		);

		const path = await catchRedirect(() => revokeMemberAction(revokeForm()));

		expect(path).toBe("/en/settings?tab=members&error=already");
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});
});

describe("reinviteMemberAction", () => {
	function revokedMembership(overrides: Record<string, unknown> = {}) {
		return {
			id: "membership-1",
			orgId: "org-1",
			userId: "user-2",
			role: "RESPONDER",
			revokedAt: new Date("2026-11-20T08:00:00.000Z"),
			user: { id: "user-2", email: "member@example.test" },
			...overrides,
		};
	}

	beforeEach(() => {
		mocks.membership.findFirst.mockResolvedValue(revokedMembership());
	});

	it("is admin-only", async () => {
		mocks.requireUser.mockResolvedValue(current("RESPONDER"));

		const state = await reinviteMemberAction({ ok: false }, reinviteForm());

		expect(state).toEqual({ ok: false, error: "forbidden" });
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("refuses an active member", async () => {
		mocks.membership.findFirst.mockResolvedValue(revokedMembership({ revokedAt: null }));

		const state = await reinviteMemberAction({ ok: false }, reinviteForm());

		expect(state).toEqual({ ok: false, error: "active" });
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it("clears overrides, resets the role, invalidates old tokens and mints a new one", async () => {
		const state = await reinviteMemberAction({ ok: false }, reinviteForm({ role: "USER" }));
		const token = tokenFrom(state);

		expect(state.ok).toBe(true);
		expect(state.role).toBe("USER");
		expect(state.delivery).toBe("link");
		expect(mocks.membershipPermission.deleteMany).toHaveBeenCalledWith({
			where: { membershipId: "membership-1" },
		});
		expect(mocks.membership.update).toHaveBeenCalledWith({
			where: { id: "membership-1" },
			data: { role: "USER", invitedBy: "admin-1" },
		});
		// Still revoked until the new link is accepted.
		expect(mocks.membership.update.mock.calls[0]?.[0].data).not.toHaveProperty("revokedAt");
		expect(mocks.invitationToken.updateMany).toHaveBeenCalledWith({
			where: { orgId: "org-1", email: "member@example.test", usedAt: null },
			data: { usedAt: expect.any(Date) },
		});
		expect(mocks.invitationToken.create.mock.calls[0]?.[0].data).toMatchObject({
			orgId: "org-1",
			email: "member@example.test",
			role: "USER",
			createdById: "admin-1",
			tokenHash: hashInvitationToken(token),
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				orgId: "org-1",
				actorId: "admin-1",
				action: "member.reinvited",
				target: "membership-1",
				metadata: expect.objectContaining({
					email: "member@example.test",
					role: "USER",
					previousRole: "RESPONDER",
					inviteId: "invitation-1",
				}),
			}),
		});
	});

	it("rejects an unknown role without writing", async () => {
		const state = await reinviteMemberAction({ ok: false }, reinviteForm({ role: "OWNER" }));

		expect(state).toEqual({ ok: false, error: "invalid" });
		expect(mocks.$transaction).not.toHaveBeenCalled();
	});
});
