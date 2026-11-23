import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getCurrentUser: vi.fn(),
	readVapidConfig: vi.fn(),
	updateMany: vi.fn(),
	create: vi.fn(),
	findUnique: vi.fn(),
	deleteMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
	getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/push/config", () => ({
	readVapidConfig: mocks.readVapidConfig,
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		pushSubscription: {
			updateMany: mocks.updateMany,
			create: mocks.create,
			findUnique: mocks.findUnique,
			deleteMany: mocks.deleteMany,
		},
	},
}));

import { PUSH_SUBSCRIPTION_CONFLICT } from "@/lib/push/schema";
import { DELETE, POST } from "./route";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

function keyBytes(length: number, first: number): Uint8Array {
	const bytes = new Uint8Array(length).fill(7);
	bytes[0] = first;
	return bytes;
}

const p256dh = Buffer.from(keyBytes(65, 0x04)).toString("base64url");
const auth = Buffer.from(keyBytes(16, 9)).toString("base64url");

function session(userId = "user-1", orgId = "org-1") {
	return {
		session: { sub: userId, orgId, role: "ADMIN", email: "op@example.com", name: "Op" },
		user: { id: userId, email: "op@example.com", name: "Op" },
		org: { id: orgId, name: "Org", slug: "org" },
		role: "ADMIN",
	};
}

function subscribeRequest(overrides: Record<string, unknown> = {}) {
	return new Request("http://localhost/api/push/subscribe", {
		method: "POST",
		headers: { "content-type": "application/json", "user-agent": "TestAgent/1.0" },
		body: JSON.stringify({
			endpoint: ENDPOINT,
			keys: { p256dh, auth },
			locale: "tl",
			...overrides,
		}),
	});
}

function unsubscribeRequest(overrides: Record<string, unknown> = {}) {
	return new Request("http://localhost/api/push/subscribe", {
		method: "DELETE",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ endpoint: ENDPOINT, ...overrides }),
	});
}

function uniqueViolation() {
	return Object.assign(new Error("unique"), { code: "P2002" });
}

describe("POST /api/push/subscribe", () => {
	beforeEach(() => {
		mocks.getCurrentUser.mockReset();
		mocks.readVapidConfig.mockReset();
		mocks.updateMany.mockReset();
		mocks.create.mockReset();
		mocks.findUnique.mockReset();
		mocks.deleteMany.mockReset();

		mocks.getCurrentUser.mockResolvedValue(session());
		mocks.readVapidConfig.mockReturnValue({
			publicKey: "public",
			privateKey: "private",
			subject: "mailto:ops@example.com",
		});
		mocks.updateMany.mockResolvedValue({ count: 0 });
		mocks.create.mockResolvedValue({ id: "ps-1", locale: "tl" });
		mocks.findUnique.mockResolvedValue(null);
	});

	it("refuses an anonymous caller", async () => {
		mocks.getCurrentUser.mockResolvedValue(null);
		const response = await POST(subscribeRequest());
		expect(response.status).toBe(401);
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});

	it("refuses to subscribe when VAPID is not configured", async () => {
		mocks.readVapidConfig.mockReturnValue(null);
		const response = await POST(subscribeRequest());
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.error.code).toBe("UNAVAILABLE");
		expect(mocks.updateMany).not.toHaveBeenCalled();
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("rejects loopback endpoints and non-allowlisted hosts", async () => {
		for (const endpoint of [
			"https://127.0.0.1/send",
			"https://169.254.169.254/latest/meta-data",
			"https://push.example.test/send",
			"https://user@fcm.googleapis.com/send",
			"https://fcm.googleapis.com:8443/send",
		]) {
			const response = await POST(subscribeRequest({ endpoint }));
			expect(response.status).toBe(400);
		}
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});

	it("rejects malformed subscription keys with a field error", async () => {
		const wrongLength = Buffer.from(keyBytes(64, 0x04)).toString("base64url");
		const response = await POST(subscribeRequest({ keys: { p256dh: wrongLength, auth } }));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error.details.fieldErrors.keys?.[0]).toContain("65-byte");
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("creates a subscription for the session owner", async () => {
		const response = await POST(subscribeRequest());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ subscribed: true, id: "ps-1", locale: "tl" });
		expect(mocks.updateMany).toHaveBeenCalledWith({
			where: { endpoint: ENDPOINT, userId: "user-1", orgId: "org-1" },
			data: {
				p256dh,
				auth,
				userAgent: "TestAgent/1.0",
				locale: "tl",
			},
		});
		expect(mocks.create).toHaveBeenCalledWith({
			data: {
				p256dh,
				auth,
				userAgent: "TestAgent/1.0",
				locale: "tl",
				endpoint: ENDPOINT,
				userId: "user-1",
				orgId: "org-1",
			},
			select: { id: true, locale: true },
		});
	});

	it("ignores owner fields supplied in the body", async () => {
		await POST(subscribeRequest({ userId: "user-9", orgId: "org-9" }));
		const call = mocks.create.mock.calls[0]?.[0];
		expect(call.data.userId).toBe("user-1");
		expect(call.data.orgId).toBe("org-1");
	});

	it("updates the caller's existing row without writing ownership", async () => {
		mocks.updateMany.mockResolvedValue({ count: 1 });
		mocks.findUnique.mockResolvedValue({ id: "ps-1", locale: "tl" });

		const response = await POST(subscribeRequest());
		expect(response.status).toBe(200);
		expect(mocks.create).not.toHaveBeenCalled();

		const update = mocks.updateMany.mock.calls[0]?.[0];
		expect(update.where).toEqual({ endpoint: ENDPOINT, userId: "user-1", orgId: "org-1" });
		expect(update.data).not.toHaveProperty("userId");
		expect(update.data).not.toHaveProperty("orgId");
		expect(update.data).not.toHaveProperty("endpoint");
	});

	it("refuses an endpoint owned by another account with a generic message", async () => {
		mocks.create.mockRejectedValue(uniqueViolation());
		mocks.findUnique.mockResolvedValue({ userId: "user-2" });

		const response = await POST(subscribeRequest());
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error.code).toBe("CONFLICT");
		expect(body.error.message).toBe(PUSH_SUBSCRIPTION_CONFLICT);
		expect(body.error.message.toLowerCase()).not.toContain("another");
	});

	it("recovers when the unique race is this account retrying", async () => {
		mocks.create.mockRejectedValueOnce(uniqueViolation());
		mocks.findUnique
			.mockResolvedValueOnce({ userId: "user-1" })
			.mockResolvedValueOnce({ id: "ps-1", locale: "tl" });
		mocks.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

		const response = await POST(subscribeRequest());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ subscribed: true, id: "ps-1", locale: "tl" });
		expect(mocks.updateMany).toHaveBeenCalledTimes(2);
	});

	it("returns 429 after the per-user subscription budget", async () => {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const response = await POST(subscribeRequest());
			expect(response.status).toBe(200);
		}

		const response = await POST(subscribeRequest());
		const body = await response.json();
		expect(response.status).toBe(429);
		expect(body.error.code).toBe("RATE_LIMITED");
	});
});

describe("DELETE /api/push/subscribe", () => {
	beforeEach(() => {
		mocks.getCurrentUser.mockReset();
		mocks.deleteMany.mockReset();
		mocks.getCurrentUser.mockResolvedValue(session());
		mocks.deleteMany.mockResolvedValue({ count: 1 });
	});

	it("refuses an anonymous caller", async () => {
		mocks.getCurrentUser.mockResolvedValue(null);
		const response = await DELETE(unsubscribeRequest());
		expect(response.status).toBe(401);
		expect(mocks.deleteMany).not.toHaveBeenCalled();
	});

	it("revokes only the caller's row", async () => {
		const response = await DELETE(unsubscribeRequest());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ revoked: true });
		expect(mocks.deleteMany).toHaveBeenCalledWith({
			where: { endpoint: ENDPOINT, userId: "user-1", orgId: "org-1" },
		});
	});

	it("can revoke a legacy host even when it is not allowlisted", async () => {
		const response = await DELETE(
			unsubscribeRequest({ endpoint: "https://push.example.test/old" }),
		);
		expect(response.status).toBe(200);
	});

	it("works without a VAPID configuration", async () => {
		mocks.readVapidConfig.mockReturnValue(null);
		const response = await DELETE(unsubscribeRequest());
		expect(response.status).toBe(200);
	});

	it("treats an already-revoked subscription as success", async () => {
		mocks.deleteMany.mockResolvedValue({ count: 0 });
		const response = await DELETE(unsubscribeRequest());
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.data).toEqual({ revoked: false });
	});

	it("rejects a non-HTTPS endpoint", async () => {
		const response = await DELETE(unsubscribeRequest({ endpoint: "http://x.test/y" }));
		expect(response.status).toBe(400);
		expect(mocks.deleteMany).not.toHaveBeenCalled();
	});
});
