import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	platformAdminFindUnique: vi.fn(),
	getPlatformSession: vi.fn(),
	isPlatformAdminEnabled: vi.fn(),
	getLocale: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: { platformAdmin: { findUnique: mocks.platformAdminFindUnique } },
}));

vi.mock("./platform-session", () => ({
	getPlatformSession: mocks.getPlatformSession,
}));

vi.mock("@/lib/platform/gate", () => ({
	isPlatformAdminEnabled: mocks.isPlatformAdminEnabled,
}));

vi.mock("next-intl/server", () => ({ getLocale: mocks.getLocale }));

vi.mock("next/navigation", () => ({
	notFound: () => {
		throw new Error("not-found");
	},
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`);
	},
}));

import { getPlatformAdmin, requirePlatformAdmin } from "./platform";

const admin = {
	id: "user-9",
	email: "platform@example.test",
	name: "Platform Operator",
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getLocale.mockResolvedValue("en");
	mocks.isPlatformAdminEnabled.mockReturnValue(true);
	mocks.getPlatformSession.mockResolvedValue({
		sub: "user-9",
		email: "platform@example.test",
		name: "Platform Operator",
	});
	mocks.platformAdminFindUnique.mockResolvedValue({
		userId: "user-9",
		user: admin,
	});
});

describe("getPlatformAdmin", () => {
	it("returns null without reading a session when the gate is closed", async () => {
		mocks.isPlatformAdminEnabled.mockReturnValue(false);

		await expect(getPlatformAdmin()).resolves.toBeNull();
		expect(mocks.getPlatformSession).not.toHaveBeenCalled();
		expect(mocks.platformAdminFindUnique).not.toHaveBeenCalled();
	});

	it("returns null when only a tenant session exists", async () => {
		// The tenant cookie is a different cookie, so a tenant ADMIN has no
		// platform session even while signed in to the dashboard.
		mocks.getPlatformSession.mockResolvedValue(null);

		await expect(getPlatformAdmin()).resolves.toBeNull();
		expect(mocks.platformAdminFindUnique).not.toHaveBeenCalled();
	});

	it("returns null when the session has no PlatformAdmin row", async () => {
		mocks.platformAdminFindUnique.mockResolvedValue(null);

		await expect(getPlatformAdmin()).resolves.toBeNull();
	});

	it("resolves the platform admin from the separate row", async () => {
		await expect(getPlatformAdmin()).resolves.toEqual(admin);
		expect(mocks.platformAdminFindUnique).toHaveBeenCalledWith({
			where: { userId: "user-9" },
			select: {
				userId: true,
				user: { select: { id: true, email: true, name: true } },
			},
		});
	});
});

describe("requirePlatformAdmin", () => {
	it("returns not-found when the gate is closed", async () => {
		mocks.isPlatformAdminEnabled.mockReturnValue(false);

		await expect(requirePlatformAdmin()).rejects.toThrow("not-found");
	});

	it("redirects to login without a platform session", async () => {
		mocks.getPlatformSession.mockResolvedValue(null);

		await expect(requirePlatformAdmin()).rejects.toThrow("redirect:/en/login");
	});

	it("returns the platform admin when the row exists", async () => {
		await expect(requirePlatformAdmin()).resolves.toEqual(admin);
	});
});
