import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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

vi.mock("./secret", () => ({
	resolveAuthSecret: () => new Uint8Array(32),
	shouldUseSecureSessionCookie: () => false,
}));

import { PLATFORM_SESSION_COOKIE } from "@/lib/constants";
import { getPlatformSession } from "./platform-session";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.cookieGet.mockReturnValue({ value: "platform-token" });
	mocks.jwtVerify.mockResolvedValue({
		payload: {
			scope: "platform",
			sub: "user-9",
			email: "platform@example.test",
			name: "Platform Operator",
		},
	});
});

describe("getPlatformSession", () => {
	it("reads only the platform cookie", async () => {
		await getPlatformSession();

		expect(mocks.cookieGet).toHaveBeenCalledWith(PLATFORM_SESSION_COOKIE);
	});

	it("accepts a platform-scoped payload", async () => {
		await expect(getPlatformSession()).resolves.toEqual({
			sub: "user-9",
			email: "platform@example.test",
			name: "Platform Operator",
		});
	});

	it("rejects a tenant payload placed in the platform cookie", async () => {
		mocks.jwtVerify.mockResolvedValue({
			payload: {
				sub: "user-1",
				orgId: "org-1",
				role: "ADMIN",
				email: "admin@example.test",
				name: "Tenant Admin",
			},
		});

		await expect(getPlatformSession()).resolves.toBeNull();
	});

	it("returns null without a cookie", async () => {
		mocks.cookieGet.mockReturnValue(undefined);
		await expect(getPlatformSession()).resolves.toBeNull();
		expect(mocks.jwtVerify).not.toHaveBeenCalled();
	});
});
