/**
 * Browser-side Web Push helpers.
 *
 * Everything here takes the browser objects as arguments instead of reaching
 * for globals, so the logic is testable in jsdom and the component stays small.
 * No key, endpoint or token is written to storage or logs.
 */

export const PUSH_SERVICE_WORKER_URL = "/sw.js";

export interface BrowserPushSubscription {
	endpoint: string;
	getKey(name: "p256dh" | "auth"): ArrayBuffer | null;
	unsubscribe(): Promise<boolean>;
}

export interface BrowserPushRegistration {
	pushManager: {
		getSubscription(): Promise<BrowserPushSubscription | null>;
		subscribe(options?: PushSubscriptionOptionsInit): Promise<BrowserPushSubscription>;
	};
}

export interface BrowserServiceWorkerContainer {
	register(url: string): Promise<BrowserPushRegistration>;
	getRegistration(): Promise<BrowserPushRegistration | undefined>;
}

export interface StoredPushSubscription {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

export type PushClientState = "unsupported" | "unconfigured" | "denied" | "subscribed" | "idle";

/** Which message the control should show. Order matters: honesty first. */
export function resolvePushClientState({
	supported,
	configured,
	permission,
	subscribed,
}: {
	supported: boolean;
	configured: boolean;
	permission: NotificationPermission | "default";
	subscribed: boolean;
}): PushClientState {
	if (!supported) return "unsupported";
	if (!configured) return "unconfigured";
	if (permission === "denied") return "denied";
	if (subscribed) return "subscribed";
	return "idle";
}

export function isPushSupported(container: BrowserServiceWorkerContainer | undefined): boolean {
	return Boolean(container && typeof container.register === "function");
}

/** Base64url (or base64) to the byte array `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64);
	const bytes = new Uint8Array(raw.length);
	for (let index = 0; index < raw.length; index += 1) {
		bytes[index] = raw.charCodeAt(index);
	}
	return bytes;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Turn a browser subscription into the row the server stores. */
export function readPushSubscription(
	subscription: Pick<BrowserPushSubscription, "endpoint" | "getKey"> | null | undefined,
): StoredPushSubscription | null {
	if (!subscription || subscription.endpoint.length === 0) return null;
	const p256dh = subscription.getKey("p256dh");
	const auth = subscription.getKey("auth");
	if (!p256dh || !auth) return null;
	const encodedP256dh = bufferToBase64Url(p256dh);
	const encodedAuth = bufferToBase64Url(auth);
	if (encodedP256dh.length === 0 || encodedAuth.length === 0) return null;
	return { endpoint: subscription.endpoint, keys: { p256dh: encodedP256dh, auth: encodedAuth } };
}

export async function registerPushServiceWorker(
	container: BrowserServiceWorkerContainer | undefined,
	url = PUSH_SERVICE_WORKER_URL,
): Promise<BrowserPushRegistration | null> {
	if (!container || typeof container.register !== "function") return null;
	return container.register(url);
}

async function registrationFor(
	container: BrowserServiceWorkerContainer | undefined,
): Promise<BrowserPushRegistration | null> {
	if (!container) return null;
	const existing = (await container.getRegistration()) ?? null;
	if (existing) return existing;
	return registerPushServiceWorker(container);
}

export async function currentPushSubscription(
	container: BrowserServiceWorkerContainer | undefined,
): Promise<BrowserPushSubscription | null> {
	if (!container || typeof container.getRegistration !== "function") return null;
	const registration = (await container.getRegistration()) ?? null;
	if (!registration) return null;
	return registration.pushManager.getSubscription();
}

/** The endpoint of this browser's subscription, for logout revocation. */
export async function currentPushEndpoint(
	container: BrowserServiceWorkerContainer | undefined,
): Promise<string | null> {
	try {
		const subscription = await currentPushSubscription(container);
		return subscription?.endpoint ?? null;
	} catch {
		return null;
	}
}

/**
 * Subscribe this browser. Reuses an existing subscription so a second click
 * cannot create a second endpoint.
 */
export async function subscribeToPush(
	container: BrowserServiceWorkerContainer | undefined,
	publicKey: string,
): Promise<StoredPushSubscription> {
	const registration = await registrationFor(container);
	if (!registration) throw new Error("Push is not supported in this browser.");
	const existing = await registration.pushManager.getSubscription();
	const subscription =
		existing ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey),
		}));
	const stored = readPushSubscription(subscription);
	if (!stored) throw new Error("The browser returned an incomplete push subscription.");
	return stored;
}

/** Drop the browser subscription and return its endpoint, if there was one. */
export async function unsubscribeFromPush(
	container: BrowserServiceWorkerContainer | undefined,
): Promise<string | null> {
	const subscription = await currentPushSubscription(container);
	if (!subscription) return null;
	const endpoint = subscription.endpoint;
	try {
		await subscription.unsubscribe();
	} catch {
		// The server row is the authority; a browser that cannot unsubscribe
		// still gets its row revoked.
	}
	return endpoint;
}
