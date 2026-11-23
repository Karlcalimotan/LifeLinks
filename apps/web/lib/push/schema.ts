import "server-only";

import { z } from "zod";
import { PUSH_LOCALES } from "./payload";

/**
 * Request shapes for the subscription API.
 *
 * A subscription row is a capability: the server later POSTs to the stored
 * endpoint with a VAPID JWT. Accepting an arbitrary HTTPS host would turn the
 * incident path into an authenticated request proxy (SSRF). Endpoints are
 * therefore limited to the public push services the console actually targets,
 * plus hosts the owner deliberately configures in `WEB_PUSH_ALLOWED_HOSTS`.
 * The sender revalidates stored endpoints before every delivery.
 */

export const PUSH_ENDPOINT_MAX = 2048;
export const PUSH_KEY_MAX = 256;
export const PUSH_KEY_MIN = 16;
export const PUSH_USER_AGENT_MAX = 512;

/** Small budget: a browser subscribes once, plus a retry or two. */
export const PUSH_SUBSCRIBE_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

export const PUSH_ALLOWED_HOSTS_ENV = "WEB_PUSH_ALLOWED_HOSTS";

/**
 * Deliberately generic: a caller must not learn whether an endpoint belongs to
 * another account, only that this browser cannot be registered for this one.
 */
export const PUSH_SUBSCRIPTION_CONFLICT =
	"This browser subscription cannot be registered for this account.";

/** Chrome/Edge (FCM) and Safari (APNs). */
export const PUSH_DEFAULT_ENDPOINT_HOSTS = ["fcm.googleapis.com", "web.push.apple.com"] as const;

/** Firefox (Mozilla autopush) and Windows (WNS). */
export const PUSH_DEFAULT_ENDPOINT_SUFFIXES = [
	".push.services.mozilla.com",
	".notify.windows.com",
] as const;

/** A hostname, optionally a `*.` wildcard. Never an address or a URL. */
const HOSTNAME_ENTRY =
	/^(?:\*\.)?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export interface PushEndpointPolicy {
	/** Exact hostnames, lower case. */
	hosts: readonly string[];
	/** Suffixes with a leading dot, lower case. */
	suffixes: readonly string[];
}

export type PushEndpointProblem =
	| "invalid_url"
	| "https_required"
	| "credentials"
	| "ip_literal"
	| "port"
	| "host_not_allowed";

export const PUSH_ENDPOINT_MESSAGES: Record<PushEndpointProblem, string> = {
	invalid_url: "Enter a valid push endpoint URL.",
	https_required: "Push endpoints must use HTTPS.",
	credentials: "Push endpoints must not contain credentials.",
	ip_literal: "Push endpoints must not be IP addresses.",
	port: "Push endpoints must use the default HTTPS port.",
	host_not_allowed: "This push service is not allowed.",
};

/**
 * The allowlist: the known public push services plus any host the owner names
 * in `WEB_PUSH_ALLOWED_HOSTS` (comma separated, `*.` for a subdomain wildcard).
 * Invalid entries are ignored, never guessed at.
 */
export function readPushEndpointPolicy(
	env: Record<string, string | undefined> = process.env,
): PushEndpointPolicy {
	const hosts: string[] = [...PUSH_DEFAULT_ENDPOINT_HOSTS];
	const suffixes: string[] = [...PUSH_DEFAULT_ENDPOINT_SUFFIXES];

	for (const raw of (env[PUSH_ALLOWED_HOSTS_ENV] ?? "").split(",")) {
		const entry = raw.trim().toLowerCase();
		if (!HOSTNAME_ENTRY.test(entry)) continue;
		if (entry.startsWith("*.")) suffixes.push(entry.slice(1));
		else hosts.push(entry);
	}

	return { hosts, suffixes };
}

function isIpLiteral(hostname: string): boolean {
	const host = hostname.replace(/^\[|\]$/g, "");
	if (host.includes(":")) return true;
	return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function isAllowedHost(hostname: string, policy: PushEndpointPolicy): boolean {
	const host = hostname.toLowerCase();
	if (policy.hosts.some((entry) => host === entry)) return true;
	return policy.suffixes.some((entry) => host === entry.slice(1) || host.endsWith(entry));
}

/** Why an endpoint is unacceptable, or null when it is allowed. */
export function pushEndpointProblem(
	value: string,
	policy: PushEndpointPolicy = readPushEndpointPolicy(),
): PushEndpointProblem | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return "invalid_url";
	}

	if (url.protocol !== "https:") return "https_required";
	if (url.username.length > 0 || url.password.length > 0) return "credentials";
	if (url.port.length > 0 && url.port !== "443") return "port";
	if (url.hostname.length === 0) return "invalid_url";
	if (isIpLiteral(url.hostname)) return "ip_literal";
	if (!isAllowedHost(url.hostname, policy)) return "host_not_allowed";
	return null;
}

export function isAllowedPushEndpoint(
	value: string,
	policy: PushEndpointPolicy = readPushEndpointPolicy(),
): boolean {
	return pushEndpointProblem(value, policy) === null;
}

/** Decode a browser key. Both base64url and padded base64 are accepted. */
export function decodePushKey(value: string): Uint8Array | null {
	const trimmed = value.trim();
	if (!BASE64URL.test(trimmed) && !BASE64.test(trimmed)) return null;
	const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
	try {
		const bytes = Buffer.from(normalized, "base64");
		return bytes.length > 0 ? new Uint8Array(bytes) : null;
	} catch {
		return null;
	}
}

const endpoint = z
	.string()
	.trim()
	.min(1)
	.max(PUSH_ENDPOINT_MAX)
	.superRefine((value, ctx) => {
		const problem = pushEndpointProblem(value);
		if (problem) {
			ctx.addIssue({ code: "custom", message: PUSH_ENDPOINT_MESSAGES[problem] });
		}
	});

/**
 * Revocation is deliberately more permissive than subscription: it deletes a
 * row the caller already owns and never fetches the URL. A subscription stored
 * before an allowlist change must still be removable.
 */
const revocableEndpoint = z
	.string()
	.trim()
	.min(1)
	.max(PUSH_ENDPOINT_MAX)
	.refine(isHttpsEndpoint, "Push endpoints must be HTTPS URLs.");

const subscriptionKey = z
	.string()
	.trim()
	.min(PUSH_KEY_MIN)
	.max(PUSH_KEY_MAX)
	.refine((value) => decodePushKey(value) !== null, "Push keys are base64 or base64url values.");

export const pushSubscribeSchema = z
	.object({
		endpoint,
		keys: z.object({
			p256dh: subscriptionKey,
			auth: subscriptionKey,
		}),
		locale: z.enum(PUSH_LOCALES).optional(),
	})
	.superRefine((value, ctx) => {
		const p256dh = decodePushKey(value.keys.p256dh);
		if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 0x04) {
			ctx.addIssue({
				code: "custom",
				path: ["keys", "p256dh"],
				message: "The p256dh key must be a 65-byte uncompressed P-256 point.",
			});
		}
		const auth = decodePushKey(value.keys.auth);
		if (!auth || auth.length !== 16) {
			ctx.addIssue({
				code: "custom",
				path: ["keys", "auth"],
				message: "The auth secret must be 16 bytes.",
			});
		}
	});

export const pushUnsubscribeSchema = z.object({
	endpoint: revocableEndpoint,
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export function isHttpsEndpoint(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname.length > 0;
	} catch {
		return false;
	}
}

/** Store a bounded user agent; an absent or blank header is stored as null. */
export function clampUserAgent(value: string | null | undefined): string | null {
	const trimmed = (value ?? "").trim();
	if (trimmed.length === 0) return null;
	return trimmed.slice(0, PUSH_USER_AGENT_MAX);
}
