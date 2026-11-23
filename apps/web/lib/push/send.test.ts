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
		endpoint: "https://push.example.test/send/1",
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
		mocks.membershipFindMany.mockResolvedValue([{ userId: "owner-1" }, { userId: "admin-1" }]);
		mocks.subscriptionFindMany.mockResolvedValue([subscription()]);
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

	it("delivers to the operator subscriptions of the organisation", async () => {
		mocks.subscriptionFindMany.mockResolvedValue([
			subscription({ id: "sub-en" }),
			subscription({ id: "sub-tl", locale: "tl" }),
		]);

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 2, sent: 2, removed: 0, failed: 0 });
		expect(mocks.sendNotification).toHaveBeenCalledTimes(2);

		const [firstSubscription, firstPayload, firstOptions] =
			mocks.sendNotification.mock.calls[0] ?? [];
		expect(firstSubscription).toEqual({
			endpoint: "https://push.example.test/send/1",
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

	it("scopes recipients to incident managers and the vehicle owner", async () => {
		await notifyIncidentPush(input);

		expect(mocks.membershipFindMany).toHaveBeenCalledWith({
			where: {
				orgId: "org-1",
				OR: [{ role: { in: ["ADMIN", "RESPONDER"] } }, { userId: "owner-1" }],
			},
			select: { userId: true },
			take: PUSH_FANOUT_LIMIT,
		});
		expect(mocks.subscriptionFindMany).toHaveBeenCalledWith({
			where: { orgId: "org-1", userId: { in: ["owner-1", "admin-1"] } },
			select: { id: true, endpoint: true, p256dh: true, auth: true, locale: true },
			orderBy: { createdAt: "desc" },
			take: PUSH_FANOUT_LIMIT,
		});
	});

	it("sends nothing when the vehicle is not in the organisation", async () => {
		mocks.vehicleFindFirst.mockResolvedValue(null);
		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 0, sent: 0, removed: 0, failed: 0 });
		expect(mocks.membershipFindMany).not.toHaveBeenCalled();
	});

	it("sends nothing when nobody subscribes", async () => {
		mocks.membershipFindMany.mockResolvedValue([]);
		const summary = await notifyIncidentPush(input);

		expect(summary.targeted).toBe(0);
		expect(mocks.subscriptionFindMany).not.toHaveBeenCalled();
	});

	it.each([404, 410])(
		"deletes a subscription the push service reports as %i",
		async (statusCode) => {
			mocks.sendNotification.mockRejectedValue(
				Object.assign(new Error("gone"), {
					statusCode,
					endpoint: "https://push.example.test/send/1",
				}),
			);

			const summary = await notifyIncidentPush(input);

			expect(summary).toEqual({ configured: true, targeted: 1, sent: 0, removed: 1, failed: 0 });
			expect(mocks.subscriptionDeleteMany).toHaveBeenCalledWith({
				where: { id: { in: ["sub-1"] } },
			});
		},
	);

	it("keeps a subscription after a transient failure and logs no endpoint", async () => {
		mocks.sendNotification.mockRejectedValue(
			Object.assign(new Error("upstream said no for https://push.example.test/send/1"), {
				statusCode: 500,
				endpoint: "https://push.example.test/send/1",
			}),
		);

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 1, sent: 0, removed: 0, failed: 1 });
		expect(mocks.subscriptionDeleteMany).not.toHaveBeenCalled();

		const logged = loggedText();
		expect(logged).not.toContain("push.example.test");
		expect(logged).toContain("status=500");
	});

	it("resolves when the lookup fails, so the incident response is unaffected", async () => {
		mocks.vehicleFindFirst.mockRejectedValue(new Error("database unavailable"));

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 0, sent: 0, removed: 0, failed: 0 });
		expect(console.error).toHaveBeenCalledOnce();
		expect(loggedText()).not.toContain("database unavailable");
	});

	it("resolves when the expired-subscription cleanup fails", async () => {
		mocks.sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
		mocks.subscriptionDeleteMany.mockRejectedValue(new Error("write failed"));

		const summary = await notifyIncidentPush(input);

		expect(summary).toEqual({ configured: true, targeted: 1, sent: 0, removed: 0, failed: 0 });
	});
});
