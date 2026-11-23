import { describe, expect, it, vi } from "vitest";
import {
	type BrowserPushRegistration,
	type BrowserPushSubscription,
	type BrowserServiceWorkerContainer,
	PUSH_SERVICE_WORKER_URL,
	currentPushEndpoint,
	currentPushSubscription,
	isPushSupported,
	readPushSubscription,
	registerPushServiceWorker,
	resolvePushClientState,
	subscribeToPush,
	unsubscribeFromPush,
	urlBase64ToUint8Array,
} from "./client";

function bufferOf(bytes: number[]): ArrayBuffer {
	return new Uint8Array(bytes).buffer as ArrayBuffer;
}

function subscriptionFake(
	overrides: Partial<BrowserPushSubscription> = {},
): BrowserPushSubscription {
	return {
		endpoint: "https://push.example.test/send/1",
		getKey: (name) => (name === "p256dh" ? bufferOf([1, 2, 3]) : bufferOf([4, 5])),
		unsubscribe: vi.fn(async () => true),
		...overrides,
	};
}

function registrationFake(
	subscription: BrowserPushSubscription | null = null,
): BrowserPushRegistration & {
	pushManager: BrowserPushRegistration["pushManager"] & { subscribe: ReturnType<typeof vi.fn> };
} {
	return {
		pushManager: {
			getSubscription: vi.fn(async () => subscription),
			subscribe: vi.fn(async () => subscription ?? subscriptionFake()),
		},
	};
}

function containerFake(
	registration: BrowserPushRegistration | undefined,
): BrowserServiceWorkerContainer & {
	register: ReturnType<typeof vi.fn>;
	getRegistration: ReturnType<typeof vi.fn>;
} {
	return {
		register: vi.fn(async () => registration ?? registrationFake()),
		getRegistration: vi.fn(async () => registration),
	};
}

describe("push client state", () => {
	it("reports unsupported before anything else", () => {
		expect(
			resolvePushClientState({
				supported: false,
				configured: false,
				permission: "denied",
				subscribed: false,
			}),
		).toBe("unsupported");
	});

	it("reports an unconfigured server before permission state", () => {
		expect(
			resolvePushClientState({
				supported: true,
				configured: false,
				permission: "denied",
				subscribed: false,
			}),
		).toBe("unconfigured");
	});

	it("reports blocked notifications even with a stale subscription", () => {
		expect(
			resolvePushClientState({
				supported: true,
				configured: true,
				permission: "denied",
				subscribed: true,
			}),
		).toBe("denied");
	});

	it("reports subscribed, then idle", () => {
		expect(
			resolvePushClientState({
				supported: true,
				configured: true,
				permission: "granted",
				subscribed: true,
			}),
		).toBe("subscribed");
		expect(
			resolvePushClientState({
				supported: true,
				configured: true,
				permission: "default",
				subscribed: false,
			}),
		).toBe("idle");
	});

	it("detects a missing service worker container", () => {
		expect(isPushSupported(undefined)).toBe(false);
		expect(isPushSupported(containerFake(undefined))).toBe(true);
	});
});

describe("key and subscription conversion", () => {
	it("decodes base64url and base64 application server keys", () => {
		expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
		expect(Array.from(urlBase64ToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4]);
	});

	it("builds the stored shape from a browser subscription", () => {
		const stored = readPushSubscription(subscriptionFake());
		expect(stored).toEqual({
			endpoint: "https://push.example.test/send/1",
			keys: { p256dh: "AQID", auth: "BAU" },
		});
	});

	it("refuses an incomplete subscription", () => {
		expect(readPushSubscription(null)).toBeNull();
		expect(readPushSubscription(subscriptionFake({ getKey: () => null }))).toBeNull();
		expect(readPushSubscription(subscriptionFake({ endpoint: "" }))).toBeNull();
	});
});

describe("service worker registration", () => {
	it("registers the root worker", async () => {
		const container = containerFake(undefined);
		await registerPushServiceWorker(container);
		expect(container.register).toHaveBeenCalledWith(PUSH_SERVICE_WORKER_URL);
	});

	it("returns null when the browser has no service worker API", async () => {
		await expect(registerPushServiceWorker(undefined)).resolves.toBeNull();
	});

	it("reads an existing subscription without registering again", async () => {
		const subscription = subscriptionFake();
		const container = containerFake(registrationFake(subscription));

		await expect(currentPushSubscription(container)).resolves.toBe(subscription);
		expect(container.register).not.toHaveBeenCalled();
	});

	it("returns null when nothing is registered", async () => {
		const container = containerFake(undefined);
		await expect(currentPushSubscription(container)).resolves.toBeNull();
		await expect(currentPushEndpoint(container)).resolves.toBeNull();
	});

	it("returns the endpoint and survives a failing lookup", async () => {
		const subscription = subscriptionFake();
		await expect(currentPushEndpoint(containerFake(registrationFake(subscription)))).resolves.toBe(
			"https://push.example.test/send/1",
		);

		const broken = containerFake(undefined);
		broken.getRegistration.mockRejectedValue(new Error("denied"));
		await expect(currentPushEndpoint(broken)).resolves.toBeNull();
	});
});

describe("subscribe and unsubscribe", () => {
	it("reuses an existing subscription", async () => {
		const existing = subscriptionFake();
		const registration = registrationFake(existing);
		const stored = await subscribeToPush(containerFake(registration), "AQID");

		expect(stored.keys.p256dh).toBe("AQID");
		expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
	});

	it("subscribes with the VAPID key when none exists", async () => {
		const registration = registrationFake(null);
		await subscribeToPush(containerFake(registration), "AQID");

		expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array("AQID"),
		});
	});

	it("throws when the browser cannot subscribe", async () => {
		await expect(subscribeToPush(undefined, "AQID")).rejects.toThrow(/not supported/i);
	});

	it("unsubscribes the browser and returns the endpoint", async () => {
		const subscription = subscriptionFake();
		const endpoint = await unsubscribeFromPush(containerFake(registrationFake(subscription)));

		expect(endpoint).toBe("https://push.example.test/send/1");
		expect(subscription.unsubscribe).toHaveBeenCalledOnce();
	});

	it("still returns the endpoint when the browser refuses to unsubscribe", async () => {
		const subscription = subscriptionFake({
			unsubscribe: vi.fn(async () => {
				throw new Error("failed");
			}),
		});

		await expect(unsubscribeFromPush(containerFake(registrationFake(subscription)))).resolves.toBe(
			"https://push.example.test/send/1",
		);
	});
});
