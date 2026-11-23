import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	userFindUnique: vi.fn(),
	verifyPassword: vi.fn(),
	createSession: vi.fn(),
	destroySession: vi.fn(),
	getSession: vi.fn(),
	createPlatformSession: vi.fn(),
	destroyPlatformSession: vi.fn(),
	isPlatformAdminEnabled: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: { user: { findUnique: mocks.userFindUnique } },
}));

vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword }));

vi.mock("@/lib/auth/session", () => ({
	createSession: mocks.createSession,
	destroySession: mocks.destroySession,
	getSession: mocks.getSession,
}));

vi.mock("@/lib/auth/platform-session", () => ({
	createPlatformSession: mocks.createPlatformSession,
	destroyPlatformSession: mocks.destroyPlatformSession,
}));

vi.mock("@/lib/platform/gate", () => ({
	isPlatformAdminEnabled: mocks.isPlatformAdminEnabled,
}));

vi.mock("@/lib/push/revoke", () => ({ revokePushOnLogout: vi.fn() }));
vi.mock("@/lib/push/schema", () => ({ clampUserAgent: () => null }));

vi.mock("next/headers", () => ({
	headers: async () => ({ get: () => null }),
}));

vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`);
	},
}));

import { loginAction, logoutAction } from "./auth";

function form(email = "admin@example.test", password = "Secret123"): FormData {
	const data = new FormData();
	data.set("locale", "en");
	data.set("email", email);
	data.set("password", password);
	return data;
}

function user(overrides: Record<string, unknown> = {}) {
	return {
		id: "user-1",
		email: "admin@example.test",
		name: "Admin",
		passwordHash: "bcrypt-hash",
		memberships: [{ orgId: "org-1", role: "ADMIN", org: { id: "org-1", status: "ACTIVE" } }],
		platformAdmin: null,
		...overrides,
	};
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
	mocks.userFindUnique.mockResolvedValue(user());
	mocks.verifyPassword.mockResolvedValue(true);
	mocks.createSession.mockResolvedValue(undefined);
	mocks.destroySession.mockResolvedValue(undefined);
	mocks.createPlatformSession.mockResolvedValue(undefined);
	mocks.destroyPlatformSession.mockResolvedValue(undefined);
	mocks.isPlatformAdminEnabled.mockReturnValue(false);
});

describe("loginAction", () => {
	it("signs an active tenant member into the dashboard", async () => {
		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/dashboard");
		expect(mocks.createSession).toHaveBeenCalledWith({
			sub: "user-1",
			orgId: "org-1",
			role: "ADMIN",
			email: "admin@example.test",
			name: "Admin",
		});
		expect(mocks.createPlatformSession).not.toHaveBeenCalled();
	});

	it("clears a stale platform session before establishing a new session", async () => {
		await catchRedirect(() => loginAction(form()));

		const destroyOrder = mocks.destroyPlatformSession.mock.invocationCallOrder[0] ?? 0;
		const createOrder = mocks.createSession.mock.invocationCallOrder[0] ?? 0;
		expect(mocks.destroyPlatformSession).toHaveBeenCalled();
		expect(destroyOrder).toBeLessThan(createOrder);
	});

	it("clears the platform session even when the login fails", async () => {
		mocks.verifyPassword.mockResolvedValue(false);

		await catchRedirect(() => loginAction(form()));

		expect(mocks.destroyPlatformSession).toHaveBeenCalled();
		expect(mocks.createSession).not.toHaveBeenCalled();
	});

	it("rejects a suspended organization after the password check", async () => {
		mocks.userFindUnique.mockResolvedValue(
			user({
				memberships: [{ orgId: "org-1", role: "ADMIN", org: { id: "org-1", status: "SUSPENDED" } }],
			}),
		);

		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/login?error=suspended");
		expect(mocks.createSession).not.toHaveBeenCalled();
		expect(mocks.createPlatformSession).not.toHaveBeenCalled();
	});

	it("uses an active organization when another membership is suspended", async () => {
		mocks.userFindUnique.mockResolvedValue(
			user({
				memberships: [
					{
						orgId: "org-suspended",
						role: "USER",
						org: { id: "org-suspended", status: "SUSPENDED" },
					},
					{ orgId: "org-active", role: "ADMIN", org: { id: "org-active", status: "ACTIVE" } },
				],
			}),
		);

		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/dashboard");
		expect(mocks.createSession).toHaveBeenCalledWith(
			expect.objectContaining({ orgId: "org-active", role: "ADMIN" }),
		);
	});

	it("does not reveal suspension when the password is wrong", async () => {
		mocks.verifyPassword.mockResolvedValue(false);
		mocks.userFindUnique.mockResolvedValue(
			user({
				memberships: [{ orgId: "org-1", role: "ADMIN", org: { id: "org-1", status: "SUSPENDED" } }],
			}),
		);

		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/login?error=invalid");
	});

	it("signs a platform admin with no membership into the platform console", async () => {
		mocks.isPlatformAdminEnabled.mockReturnValue(true);
		mocks.userFindUnique.mockResolvedValue(
			user({ memberships: [], platformAdmin: { id: "platform-1" } }),
		);

		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/platform");
		expect(mocks.createPlatformSession).toHaveBeenCalledWith({
			sub: "user-1",
			email: "admin@example.test",
			name: "Admin",
		});
		expect(mocks.createSession).not.toHaveBeenCalled();
		expect(mocks.destroySession).toHaveBeenCalled();
	});

	it("lets a platform admin whose only organization is suspended reach the console", async () => {
		mocks.isPlatformAdminEnabled.mockReturnValue(true);
		mocks.userFindUnique.mockResolvedValue(
			user({
				memberships: [{ orgId: "org-1", role: "ADMIN", org: { id: "org-1", status: "SUSPENDED" } }],
				platformAdmin: { id: "platform-1" },
			}),
		);

		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/platform");
		expect(mocks.createPlatformSession).toHaveBeenCalled();
		expect(mocks.createSession).not.toHaveBeenCalled();
	});

	it("gives a platform admin both sessions when the tenant is active", async () => {
		mocks.isPlatformAdminEnabled.mockReturnValue(true);
		mocks.userFindUnique.mockResolvedValue(user({ platformAdmin: { id: "platform-1" } }));

		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/dashboard");
		expect(mocks.createSession).toHaveBeenCalled();
		expect(mocks.createPlatformSession).toHaveBeenCalled();
	});

	it("treats a platform admin as an ordinary account when the gate is closed", async () => {
		mocks.userFindUnique.mockResolvedValue(
			user({ memberships: [], platformAdmin: { id: "platform-1" } }),
		);

		const path = await catchRedirect(() => loginAction(form()));

		expect(path).toBe("/en/login?error=invalid");
		expect(mocks.createPlatformSession).not.toHaveBeenCalled();
	});
});

describe("logoutAction", () => {
	it("clears both the tenant and platform sessions on a shared browser", async () => {
		mocks.getSession.mockResolvedValue(null);

		const path = await catchRedirect(() => logoutAction(form()));

		expect(path).toBe("/en/login");
		expect(mocks.destroyPlatformSession).toHaveBeenCalled();
		expect(mocks.destroySession).toHaveBeenCalled();
	});
});
