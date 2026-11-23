import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: { pushSubscription: { deleteMany: mocks.deleteMany } },
}));

import { revokePushOnLogout, revokePushSubscription } from "./revoke";

describe("push revocation", () => {
	beforeEach(() => {
		mocks.deleteMany.mockReset();
		mocks.deleteMany.mockResolvedValue({ count: 1 });
	});

	it("deletes the exact endpoint for this user and organisation", async () => {
		const count = await revokePushSubscription({
			userId: "user-1",
			orgId: "org-1",
			endpoint: "https://push.example.test/send/1",
		});

		expect(count).toBe(1);
		expect(mocks.deleteMany).toHaveBeenCalledWith({
			where: {
				endpoint: "https://push.example.test/send/1",
				userId: "user-1",
				orgId: "org-1",
			},
		});
	});

	it("prefers the browser endpoint on logout", async () => {
		const count = await revokePushOnLogout({
			userId: "user-1",
			orgId: "org-1",
			endpoint: "https://push.example.test/send/1",
			userAgent: "Mozilla/5.0",
		});

		expect(count).toBe(1);
		expect(mocks.deleteMany).toHaveBeenCalledWith({
			where: {
				endpoint: "https://push.example.test/send/1",
				userId: "user-1",
				orgId: "org-1",
			},
		});
	});

	it("falls back to the user agent when the browser could not send an endpoint", async () => {
		await revokePushOnLogout({
			userId: "user-1",
			orgId: "org-1",
			endpoint: null,
			userAgent: "Mozilla/5.0",
		});

		expect(mocks.deleteMany).toHaveBeenCalledWith({
			where: { userId: "user-1", orgId: "org-1", userAgent: "Mozilla/5.0" },
		});
	});

	it("does nothing without an endpoint or a user agent", async () => {
		const count = await revokePushOnLogout({
			userId: "user-1",
			orgId: "org-1",
			endpoint: null,
			userAgent: null,
		});

		expect(count).toBe(0);
		expect(mocks.deleteMany).not.toHaveBeenCalled();
	});

	it("never throws, so logout can proceed", async () => {
		mocks.deleteMany.mockRejectedValue(new Error("database unavailable"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await expect(
			revokePushOnLogout({
				userId: "user-1",
				orgId: "org-1",
				endpoint: "https://push.example.test/send/1",
				userAgent: null,
			}),
		).resolves.toBe(0);
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});
});
