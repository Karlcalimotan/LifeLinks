import { z } from "zod";
import { PUSH_LOCALES } from "./payload";

/**
 * Request shapes for the subscription API. Validation is deliberately strict:
 * a subscription row is a capability to deliver a notification to a browser,
 * so a malformed endpoint or a missing key must be rejected at the edge rather
 * than stored and retried forever.
 */

export const PUSH_ENDPOINT_MAX = 2048;
export const PUSH_KEY_MAX = 256;
export const PUSH_KEY_MIN = 16;
export const PUSH_USER_AGENT_MAX = 512;

/** Small budget: a browser subscribes once, plus a retry or two. */
export const PUSH_SUBSCRIBE_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

const BASE64 = /^[A-Za-z0-9_+/=-]+$/;

export function isHttpsEndpoint(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname.length > 0;
	} catch {
		return false;
	}
}

const endpoint = z
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
	.regex(BASE64, "Push keys are base64 or base64url values.");

export const pushSubscribeSchema = z.object({
	endpoint,
	keys: z.object({
		p256dh: subscriptionKey,
		auth: subscriptionKey,
	}),
	locale: z.enum(PUSH_LOCALES).optional(),
});

export const pushUnsubscribeSchema = z.object({
	endpoint,
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

/** Store a bounded user agent; an absent or blank header is stored as null. */
export function clampUserAgent(value: string | null | undefined): string | null {
	const trimmed = (value ?? "").trim();
	if (trimmed.length === 0) return null;
	return trimmed.slice(0, PUSH_USER_AGENT_MAX);
}
