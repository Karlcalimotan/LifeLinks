import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	membershipFindUnique: vi.fn(),
	cookieGet: vi.fn(),
	jwtVerify: vi.fn(),
}));

vi.mock("next/headers", () => ({
	cookies: async () => ({
		get: mocks.cookieGet,
		set: vi.fn(),
		delete: vi.fn(),
	}),
}));

vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`);
	},
}));

vi.mock("jose", () => ({
	jwtVerify: mocks.jwtVerify,
	SignJWT: class {
		setProtectedHeader() {
			return this;
		}
		setSubject() {
			return this;
		}
		setIssuedAt() {
			return this;
		}
		setExpirationTime() {
			return this;
		}
		async sign() {
			return "signed";
		}
	},
}));

vi.mock("@/lib/auth/secret", () => ({
	resolveAuthSecret: () => new Uint8Array(32),
	shouldUseSecureSessionCookie: () => false,
}));

vi.mock("@/lib/prisma", () => ({
	default: { membership: { findUnique: mocks.membershipFindUnique } },
}));

import { getCurrentUser } from "./session";

const payload = {
	sub: "user-1",
	orgId: "org-1",
	role: "RESPONDER",
	email: "responder@example.test",
	name: "Responder",
};

function membership(overrides: Record<string, unknown> = {}) {
	return {
		id: "membership-1",
		orgId: "org-1",
		userId: "user-1",
		role: "RESPONDER",
		revokedAt: null,
		user: { id: "user-1", email: payload.email, name: payload.name },
		org: { id: "org-1", name: "Org", slug: "org" },
		permissions: [],
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.cookieGet.mockReturnValue({ value: "session-token" });
	mocks.jwtVerify.mockResolvedValue({ payload });
	mocks.membershipFindUnique.mockResolvedValue(membership());
});

describe("getCurrentUser", () => {
	it("re-reads the membership for the session's organization", async () => {
		const current = await getCurrentUser();

		expect(current?.role).toBe("RESPONDER");
		expect(mocks.membershipFindUnique).toHaveBeenCalledWith({
			where: { orgId_userId: { orgId: "org-1", userId: "user-1" } },
			include: {
				user: true,
				org: true,
				permissions: { select: { key: true, allowed: true } },
			},
		});
	});

	it("resolves the permission overlay for the membership", async () => {
		mocks.membershipFindUnique.mockResolvedValue(
			membership({ permissions: [{ key: "device.configure", allowed: true }] }),
		);

		const current = await getCurrentUser();

		expect(current?.permissions["device.configure"]).toBe(true);
		expect(current?.permissions["members.manage"]).toBe(false);
	});

	it("ignores a downgrade override on an admin", async () => {
		mocks.membershipFindUnique.mockResolvedValue(
			membership({
				role: "ADMIN",
				permissions: [{ key: "members.manage", allowed: false }],
			}),
		);

		const current = await getCurrentUser();

		expect(current?.permissions["members.manage"]).toBe(true);
	});

	it("returns null for a revoked membership, even with a valid cookie", async () => {
		mocks.membershipFindUnique.mockResolvedValue(
			membership({ revokedAt: new Date("2026-11-24T08:00:00.000Z") }),
		);

		await expect(getCurrentUser()).resolves.toBeNull();
	});

	it("returns null when the membership no longer exists", async () => {
		mocks.membershipFindUnique.mockResolvedValue(null);
		await expect(getCurrentUser()).resolves.toBeNull();
	});

	it("returns null without a cookie", async () => {
		mocks.cookieGet.mockReturnValue(undefined);

		await expect(getCurrentUser()).resolves.toBeNull();
		expect(mocks.membershipFindUnique).not.toHaveBeenCalled();
	});
});
