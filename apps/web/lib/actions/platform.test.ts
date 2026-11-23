import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getPlatformAdmin: vi.fn(),
	verifyPassword: vi.fn(),
	rateLimit: vi.fn(),
	userFindUnique: vi.fn(),
	organizationFindUnique: vi.fn(),
	organizationUpdateMany: vi.fn(),
	auditLogCreate: vi.fn(),
	transaction: vi.fn(),
	revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/platform", () => ({ getPlatformAdmin: mocks.getPlatformAdmin }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

vi.mock("@/lib/prisma", () => ({
	default: {
		user: { findUnique: mocks.userFindUnique },
		$transaction: mocks.transaction,
	},
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`);
	},
}));

import { reinstateOrganizationAction, suspendOrganizationAction } from "./platform";

function form(overrides: Record<string, string> = {}): FormData {
	const data = new FormData();
	data.set("locale", "en");
	data.set("orgId", overrides.orgId ?? "org-1");
	data.set("reason", overrides.reason ?? "Non-payment and repeated abuse reports.");
	data.set("password", overrides.password ?? "Secret123");
	return data;
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
	mocks.getPlatformAdmin.mockResolvedValue({
		id: "platform-1",
		email: "platform@example.test",
		name: "Platform Operator",
	});
	mocks.verifyPassword.mockResolvedValue(true);
	mocks.rateLimit.mockReturnValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
	mocks.userFindUnique.mockResolvedValue({ passwordHash: "bcrypt-hash" });
	mocks.organizationFindUnique.mockResolvedValue({
		id: "org-1",
		name: "Acme Fleet",
		status: "ACTIVE",
	});
	mocks.organizationUpdateMany.mockResolvedValue({ count: 1 });
	mocks.auditLogCreate.mockResolvedValue({});
	mocks.revalidatePath.mockReturnValue(undefined);
	mocks.transaction.mockImplementation(async (fn: unknown) =>
		(fn as (tx: unknown) => Promise<unknown>)({
			organization: {
				findUnique: mocks.organizationFindUnique,
				updateMany: mocks.organizationUpdateMany,
			},
			auditLog: { create: mocks.auditLogCreate },
		}),
	);
});

describe("suspendOrganizationAction", () => {
	it("refuses without a platform admin", async () => {
		mocks.getPlatformAdmin.mockResolvedValue(null);

		await expect(suspendOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "forbidden",
		});
		expect(mocks.verifyPassword).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("requires a bounded reason", async () => {
		const short = await suspendOrganizationAction({ ok: false }, form({ reason: "no" }));
		const long = await suspendOrganizationAction({ ok: false }, form({ reason: "x".repeat(501) }));

		expect(short).toEqual({ ok: false, error: "invalid_reason" });
		expect(long).toEqual({ ok: false, error: "invalid_reason" });
		expect(mocks.verifyPassword).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("reports a missing password separately from a wrong reason", async () => {
		const state = await suspendOrganizationAction({ ok: false }, form({ password: "" }));

		expect(state).toEqual({ ok: false, error: "invalid_credentials" });
		expect(mocks.verifyPassword).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("requires the current password before the mutation", async () => {
		mocks.verifyPassword.mockResolvedValue(false);

		await expect(suspendOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "password",
		});
		expect(mocks.verifyPassword).toHaveBeenCalledWith("Secret123", "bcrypt-hash");
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("refuses when the step-up rate limit is exhausted", async () => {
		mocks.rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });

		await expect(suspendOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "rate",
		});
		expect(mocks.verifyPassword).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("suspends with a conditional update and audits the transition", async () => {
		const path = await catchRedirect(() => suspendOrganizationAction({ ok: false }, form()));

		expect(path).toBe("/en/platform?suspended=1");
		expect(mocks.organizationUpdateMany).toHaveBeenCalledWith({
			where: { id: "org-1", status: "ACTIVE" },
			data: {
				status: "SUSPENDED",
				suspendedAt: expect.any(Date),
				suspendedReason: "Non-payment and repeated abuse reports.",
				suspendedBy: "platform-1",
			},
		});
		expect(mocks.auditLogCreate).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "platform-1",
				action: "platform.org_suspended",
				target: "org-1",
				metadata: {
					reason: "Non-payment and repeated abuse reports.",
					before: "ACTIVE",
					after: "SUSPENDED",
				},
			},
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/platform");
	});

	it("reports an organization that is already suspended without writing", async () => {
		mocks.organizationFindUnique.mockResolvedValue({
			id: "org-1",
			name: "Acme Fleet",
			status: "SUSPENDED",
		});

		await expect(suspendOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "already",
			status: "SUSPENDED",
		});
		expect(mocks.organizationUpdateMany).not.toHaveBeenCalled();
		expect(mocks.auditLogCreate).not.toHaveBeenCalled();
	});

	it("reports the current state when a concurrent suspend wins the race", async () => {
		mocks.organizationUpdateMany.mockResolvedValue({ count: 0 });
		mocks.organizationFindUnique
			.mockResolvedValueOnce({ id: "org-1", name: "Acme Fleet", status: "ACTIVE" })
			.mockResolvedValueOnce({ status: "SUSPENDED" });

		await expect(suspendOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "already",
			status: "SUSPENDED",
		});
		expect(mocks.auditLogCreate).not.toHaveBeenCalled();
	});

	it("reports an unknown organization without writing", async () => {
		mocks.organizationFindUnique.mockResolvedValue(null);

		await expect(suspendOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "notfound",
		});
		expect(mocks.organizationUpdateMany).not.toHaveBeenCalled();
	});
});

describe("reinstateOrganizationAction", () => {
	beforeEach(() => {
		mocks.organizationFindUnique.mockResolvedValue({
			id: "org-1",
			name: "Acme Fleet",
			status: "SUSPENDED",
		});
	});

	it("clears the suspension fields with a conditional update and audits it", async () => {
		const path = await catchRedirect(() => reinstateOrganizationAction({ ok: false }, form()));

		expect(path).toBe("/en/platform?reinstated=1");
		expect(mocks.organizationUpdateMany).toHaveBeenCalledWith({
			where: { id: "org-1", status: "SUSPENDED" },
			data: {
				status: "ACTIVE",
				suspendedAt: null,
				suspendedReason: null,
				suspendedBy: null,
			},
		});
		expect(mocks.auditLogCreate).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "platform-1",
				action: "platform.org_reinstated",
				target: "org-1",
				metadata: {
					reason: "Non-payment and repeated abuse reports.",
					before: "SUSPENDED",
					after: "ACTIVE",
				},
			},
		});
	});

	it("reports an organization that is already active", async () => {
		mocks.organizationFindUnique.mockResolvedValue({
			id: "org-1",
			name: "Acme Fleet",
			status: "ACTIVE",
		});

		await expect(reinstateOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "already",
			status: "ACTIVE",
		});
		expect(mocks.organizationUpdateMany).not.toHaveBeenCalled();
	});

	it("reports the current state when a concurrent reinstate wins the race", async () => {
		mocks.organizationUpdateMany.mockResolvedValue({ count: 0 });
		mocks.organizationFindUnique
			.mockResolvedValueOnce({ id: "org-1", name: "Acme Fleet", status: "SUSPENDED" })
			.mockResolvedValueOnce({ status: "ACTIVE" });

		await expect(reinstateOrganizationAction({ ok: false }, form())).resolves.toEqual({
			ok: false,
			error: "already",
			status: "ACTIVE",
		});
		expect(mocks.auditLogCreate).not.toHaveBeenCalled();
	});
});
