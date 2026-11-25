import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	readVapidConfig: vi.fn(),
	sendNotification: vi.fn(),
	vehicleFindFirst: vi.fn(),
	membershipFindMany: vi.fn(),
	subscriptionFindMany: vi.fn(),
	subscriptionDeleteMany: vi.fn(),
}));

vi.mock("./config", () => ({ readVapidConfig: mocks.readVapidConfig }));

vi.mock("web-push", () => ({ sendNotification: mocks.sendNotification }));

vi.mock("@/lib/prisma", () => ({
	default: {
		vehicle: { findFirst: mocks.vehicleFindFirst },
		membership: { findMany: mocks.membershipFindMany },
		pushSubscription: {
			findMany: mocks.subscriptionFindMany,
			deleteMany: mocks.subscriptionDeleteMany,
		},
	},
}));

import {
	PUSH_FANOUT_LIMIT,
	PUSH_SEND_TIMEOUT_MS,
	PUSH_TTL_SECONDS,
	notifyIncidentPush,
} from "./send";

const config = {
	publicKey: "public-key",
	privateKey: "private-key",
	subject: "mailto:ops@example.com",
};

const input = { orgId: "org-1", incidentId: "inc-1", vehicleId: "veh-1" };

function subscription(overrides: Record<string, unknown> = {}) {
	return {
		id: "sub-1",
		endpoint: "https://fcm.googleapis.com/fcm/send/1",
		p256dh: "B".repeat(87),
		auth: "a".repeat(22),
		locale: "en",
		...overrides,
	};
}

const spies: Array<import("vitest").MockInstance> = [];

function quietConsole() {
	spies.push(
		vi.spyOn(console, "info").mockImplementation(() => {}),
		vi.spyOn(console, "warn").mockImplementation(() => {}),
		vi.spyOn(console, "error").mockImplementation(() => {}),
	);
}

function loggedText(): string {
	return spies
		.flatMap((spy) => spy.mock.calls)
		.flat()
		.join(" ");
}

describe("notifyIncidentPush", () => {
	beforeEach(() => {
		mocks.readVapidConfig.mockReset();
		mocks.sendNotification.mockReset();
		mocks.vehicleFindFirst.mockReset();
		mocks.membershipFindMany.mockReset();
		mocks.subscriptionFindMany.mockReset();
		mocks.subscriptionDeleteMany.mockReset();

		mocks.readVapidConfig.mockReturnValue(config);
		mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
		mocks.vehicleFindFirst.mockResolvedValue({ plateNo: "ABC 1234", ownerId: "owner-1" });
		mocks.membershipFindMany.mockResolvedValue([{ userId: "admin-1" }]);
		mocks.subscriptionFindMany
			.mockResolvedValueOnce([subscription({ id: "sub-owner" })])
			.mockResolvedValueOnce([
				subscription({
					id: "sub-admin",
					endpoint: "https://fcm.googleapis.com/fcm/send/2",
					locale: "tl",
				}),
			]);
		mocks.subscriptionDeleteMany.mockResolvedValue({ count: 1 });
		quietConsole();
	});

	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	it("skips without a VAPID configuration", async () => {
		mocks.readVapidConfig.mockReturnValue(null);
		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: false, targeted: 0, sent: 0, removed: 0, failed: 0 });
		expect(mocks.vehicleFindFirst).not.toHaveBeenCalled();
		expect(mocks.sendNotification).not.toHaveBeenCalled();
	});

	it("delivers to the owner and the operator subscriptions", async () => {
		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 2, sent: 2, removed: 0, failed: 0 });
		expect(mocks.sendNotification).toHaveBeenCalledTimes(2);

		const [firstSubscription, firstPayload, firstOptions] =
			mocks.sendNotification.mock.calls[0] ?? [];
		expect(firstSubscription).toEqual({
			endpoint: "https://fcm.googleapis.com/fcm/send/1",
			keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
		});
		expect(JSON.parse(firstPayload as string)).toEqual({
			incidentId: "inc-1",
			plate: "ABC 1234",
			body: "Crash detected. Open to review or stand the alert down.",
			url: "/en/incidents/inc-1?action=cancel",
		});
		expect(firstOptions).toMatchObject({
			TTL: PUSH_TTL_SECONDS,
			urgency: "high",
			timeout: PUSH_SEND_TIMEOUT_MS,
			vapidDetails: config,
		});

		const secondPayload = mocks.sendNotification.mock.calls[1]?.[1];
		expect(JSON.parse(secondPayload as string).url).toBe("/tl/incidents/inc-1?action=cancel");
	});

	it("reserves the owner's slot and scopes the operator query", async () => {
		await notifyIncidentPush(input);

		expect(mocks.subscriptionFindMany.mock.calls[0]?.[0]).toMatchObject({
			where: { orgId: "org-1", userId: "owner-1" },
			orderBy: { createdAt: "desc" },
			take: 1,
		});
		expect(mocks.membershipFindMany).toHaveBeenCalledWith({
			where: {
				orgId: "org-1",
				role: { in: ["ADMIN", "RESPONDER"] },
				userId: { not: "owner-1" },
			},
			select: { userId: true },
			take: PUSH_FANOUT_LIMIT - 1,
		});
		expect(mocks.subscriptionFindMany.mock.calls[1]?.[0]).toMatchObject({
			where: { orgId: "org-1", userId: { in: ["admin-1"] } },
			orderBy: { createdAt: "desc" },
			take: PUSH_FANOUT_LIMIT - 1,
		});
	});

	it("keeps the owner inside the cap when the organisation is large", async () => {
		const operators = Array.from({ length: PUSH_FANOUT_LIMIT - 1 }, (_, index) =>
			subscription({
				id: `sub-admin-${index}`,
				endpoint: `https://fcm.googleapis.com/fcm/send/${index + 10}`,
			}),
		);
		mocks.subscriptionFindMany.mockReset();
		mocks.subscriptionFindMany
			.mockResolvedValueOnce([subscription({ id: "sub-owner" })])
			.mockResolvedValueOnce(operators);
		mocks.membershipFindMany.mockResolvedValue(
			operators.map((row, index) => ({ userId: `admin-${index}` })),
		);

		const summary = await notifyIncidentPush(input);

		expect(summary.targeted).toBe(PUSH_FANOUT_LIMIT);
		expect(mocks.sendNotification).toHaveBeenCalledTimes(PUSH_FANOUT_LIMIT);
		expect(mocks.sendNotification.mock.calls[0]?.[0]).toMatchObject({
			endpoint: "https://fcm.googleapis.com/fcm/send/1",
		});
		expect(mocks.membershipFindMany.mock.calls[0]?.[0].take).toBe(PUSH_FANOUT_LIMIT - 1);
	});

	it("sends nothing when the vehicle is not in the organisation", async () => {
		mocks.vehicleFindFirst.mockResolvedValue(null);
		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 0, sent: 0, removed: 0, failed: 0 });
		expect(mocks.membershipFindMany).not.toHaveBeenCalled();
	});

	it("sends nothing when nobody subscribes", async () => {
		mocks.subscriptionFindMany.mockReset();
		mocks.subscriptionFindMany.mockResolvedValueOnce([]);
		mocks.membershipFindMany.mockResolvedValue([]);

		const summary = await notifyIncidentPush(input);

		expect(summary.targeted).toBe(0);
		expect(mocks.subscriptionFindMany).toHaveBeenCalledTimes(1);
	});

	it.each([404, 410])(
		"deletes a subscription the push service reports as %i",
		async (statusCode) => {
			mocks.membershipFindMany.mockResolvedValue([]);
			mocks.subscriptionFindMany.mockReset();
			mocks.subscriptionFindMany.mockResolvedValueOnce([subscription()]);
			mocks.sendNotification.mockRejectedValue(
				Object.assign(new Error("gone"), {
					statusCode,
					endpoint: "https://fcm.googleapis.com/fcm/send/1",
				}),
			);

			const summary = await notifyIncidentPush(input);

			expect(summary).toEqual({ configured: true, targeted: 1, sent: 0, removed: 1, failed: 0 });
			expect(mocks.subscriptionDeleteMany).toHaveBeenCalledWith({
				where: { id: { in: ["sub-1"] } },
			});
		},
	);

	it("refuses a stored endpoint that is no longer an allowed host", async () => {
		mocks.membershipFindMany.mockResolvedValue([]);
		mocks.subscriptionFindMany.mockReset();
		mocks.subscriptionFindMany.mockResolvedValueOnce([
			subscription({ id: "sub-evil", endpoint: "https://127.0.0.1/send/1" }),
		]);

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 1, sent: 0, removed: 0, failed: 1 });
		expect(mocks.sendNotification).not.toHaveBeenCalled();
		expect(mocks.subscriptionDeleteMany).not.toHaveBeenCalled();
		expect(loggedText()).toContain("not allowed");
		expect(loggedText()).not.toContain("127.0.0.1");
	});

	it("keeps a subscription after a transient failure and logs no endpoint", async () => {
		mocks.membershipFindMany.mockResolvedValue([]);
		mocks.subscriptionFindMany.mockReset();
		mocks.subscriptionFindMany.mockResolvedValueOnce([subscription()]);
		mocks.sendNotification.mockRejectedValue(
			Object.assign(new Error("upstream said no for https://fcm.googleapis.com/fcm/send/1"), {
				statusCode: 500,
				endpoint: "https://fcm.googleapis.com/fcm/send/1",
			}),
		);

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 1, sent: 0, removed: 0, failed: 1 });
		expect(mocks.subscriptionDeleteMany).not.toHaveBeenCalled();
		expect(loggedText()).not.toContain("fcm.googleapis.com");
		expect(loggedText()).toContain("status=500");
	});

	it("resolves when the lookup fails, so the incident response is unaffected", async () => {
		mocks.vehicleFindFirst.mockRejectedValue(new Error("database unavailable"));

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 0, sent: 0, removed: 0, failed: 0 });
		expect(console.error).toHaveBeenCalledOnce();
		expect(loggedText()).not.toContain("database unavailable");
	});

	it("resolves when the expired-subscription cleanup fails", async () => {
		mocks.membershipFindMany.mockResolvedValue([]);
		mocks.subscriptionFindMany.mockReset();
		mocks.subscriptionFindMany.mockResolvedValueOnce([subscription()]);
		mocks.sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
		mocks.subscriptionDeleteMany.mockRejectedValue(new Error("write failed"));

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 1, sent: 0, removed: 0, failed: 0 });
	});
});
