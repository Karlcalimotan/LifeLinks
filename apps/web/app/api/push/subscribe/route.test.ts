import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getCurrentUser: vi.fn(),
	findUnique: vi.fn(),
	upsert: vi.fn(),
	deleteMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
	getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		pushSubscription: {
			findUnique: mocks.findUnique,
			upsert: mocks.upsert,
			deleteMany: mocks.deleteMany,
		},
	},
}));

import { DELETE, POST } from "./route";

const ENDPOINT = "https://push.example.test/send/abc123";
const p256dh = "B".repeat(87);
const auth = "a".repeat(22);

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

describe("POST /api/push/subscribe", () => {
	beforeEach(() => {
		mocks.getCurrentUser.mockReset();
		mocks.findUnique.mockReset();
		mocks.upsert.mockReset();
		mocks.deleteMany.mockReset();

		mocks.getCurrentUser.mockResolvedValue(session());
		mocks.findUnique.mockResolvedValue(null);
		mocks.upsert.mockResolvedValue({ id: "ps-1", locale: "tl" });
	});

	it("refuses an anonymous caller", async () => {
		mocks.getCurrentUser.mockResolvedValue(null);
		const response = await POST(subscribeRequest());
		expect(response.status).toBe(401);
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("rejects a non-HTTPS endpoint before touching the database", async () => {
		const response = await POST(subscribeRequest({ endpoint: "http://push.example.test/send" }));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error.code).toBe("BAD_REQUEST");
		expect(mocks.findUnique).not.toHaveBeenCalled();
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("rejects a subscription without keys", async () => {
		const response = await POST(subscribeRequest({ keys: { p256dh } }));
		expect(response.status).toBe(400);
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("stores the subscription for the session user and organisation", async () => {
		const response = await POST(subscribeRequest());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({ subscribed: true, id: "ps-1", locale: "tl" });

		const call = mocks.upsert.mock.calls[0]?.[0];
		expect(call.where).toEqual({ endpoint: ENDPOINT });
		expect(call.create).toMatchObject({
			userId: "user-1",
			orgId: "org-1",
			endpoint: ENDPOINT,
			p256dh,
			auth,
			userAgent: "TestAgent/1.0",
			locale: "tl",
		});
		expect(call.update).toMatchObject({
			userId: "user-1",
			orgId: "org-1",
			p256dh,
			auth,
			userAgent: "TestAgent/1.0",
			locale: "tl",
		});
	});

	it("ignores owner fields in the body", async () => {
		await POST(subscribeRequest({ userId: "user-9", orgId: "org-9" }));
		const call = mocks.upsert.mock.calls[0]?.[0];
		expect(call.create.userId).toBe("user-1");
		expect(call.create.orgId).toBe("org-1");
	});

	it("defaults an omitted locale to English", async () => {
		mocks.upsert.mockResolvedValue({ id: "ps-1", locale: "en" });
		await POST(subscribeRequest({ locale: undefined }));
		expect(mocks.upsert.mock.calls[0]?.[0].create.locale).toBe("en");
	});

	it("refuses to reassign an endpoint owned by another account", async () => {
		mocks.findUnique.mockResolvedValue({ userId: "user-2" });
		const response = await POST(subscribeRequest());
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error.code).toBe("CONFLICT");
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("updates a subscription this user already owns", async () => {
		mocks.findUnique.mockResolvedValue({ userId: "user-1" });
		const response = await POST(subscribeRequest());
		expect(response.status).toBe(200);
		expect(mocks.upsert).toHaveBeenCalledOnce();
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
