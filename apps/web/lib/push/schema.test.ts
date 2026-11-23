import { describe, expect, it } from "vitest";
import {
	PUSH_ENDPOINT_MAX,
	PUSH_USER_AGENT_MAX,
	clampUserAgent,
	isHttpsEndpoint,
	pushSubscribeSchema,
	pushUnsubscribeSchema,
} from "./schema";

const auth = "a".repeat(22);
const p256dh = "B".repeat(87);

function body(overrides: Record<string, unknown> = {}) {
	return {
		endpoint: "https://push.example.test/send/abc123",
		keys: { p256dh, auth },
		locale: "tl",
		...overrides,
	};
}

describe("push subscription schema", () => {
	it("accepts an HTTPS endpoint with both keys", () => {
		const parsed = pushSubscribeSchema.safeParse(body());
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.keys.p256dh).toBe(p256dh);
			expect(parsed.data.locale).toBe("tl");
		}
	});

	it("rejects plain HTTP and non-URL endpoints", () => {
		expect(isHttpsEndpoint("http://push.example.test/send")).toBe(false);
		expect(isHttpsEndpoint("javascript:alert(1)")).toBe(false);
		expect(isHttpsEndpoint("/relative")).toBe(false);
		expect(
			pushSubscribeSchema.safeParse(body({ endpoint: "http://push.example.test/send" })).success,
		).toBe(false);
	});

	it("rejects an endpoint longer than the column budget", () => {
		const endpoint = `https://push.example.test/${"a".repeat(PUSH_ENDPOINT_MAX)}`;
		expect(pushSubscribeSchema.safeParse(body({ endpoint })).success).toBe(false);
	});

	it("requires both keys and rejects a short or malformed one", () => {
		expect(pushSubscribeSchema.safeParse({ endpoint: body().endpoint }).success).toBe(false);
		expect(pushSubscribeSchema.safeParse(body({ keys: { auth } })).success).toBe(false);
		expect(pushSubscribeSchema.safeParse(body({ keys: { p256dh, auth: "short" } })).success).toBe(
			false,
		);
		expect(
			pushSubscribeSchema.safeParse(body({ keys: { p256dh: "not base64!", auth } })).success,
		).toBe(false);
	});

	it("trims the keys and endpoint", () => {
		const parsed = pushSubscribeSchema.safeParse(
			body({
				endpoint: "  https://push.example.test/send/abc123  ",
				keys: { p256dh: ` ${p256dh} `, auth: ` ${auth} ` },
			}),
		);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.endpoint).toBe("https://push.example.test/send/abc123");
			expect(parsed.data.keys.auth).toBe(auth);
		}
	});

	it("accepts only the supported locales", () => {
		expect(pushSubscribeSchema.safeParse(body({ locale: "en" })).success).toBe(true);
		expect(pushSubscribeSchema.safeParse(body({ locale: "de" })).success).toBe(false);
	});

	it("validates the unsubscribe body", () => {
		expect(
			pushUnsubscribeSchema.safeParse({ endpoint: "https://push.example.test/x" }).success,
		).toBe(true);
		expect(
			pushUnsubscribeSchema.safeParse({ endpoint: "http://push.example.test/x" }).success,
		).toBe(false);
		expect(pushUnsubscribeSchema.safeParse({}).success).toBe(false);
	});
});

describe("user agent", () => {
	it("stores null for a missing or blank header", () => {
		expect(clampUserAgent(null)).toBeNull();
		expect(clampUserAgent("   ")).toBeNull();
	});

	it("bounds the stored value", () => {
		expect(clampUserAgent("x".repeat(PUSH_USER_AGENT_MAX + 20))).toHaveLength(PUSH_USER_AGENT_MAX);
		expect(clampUserAgent("Mozilla/5.0")).toBe("Mozilla/5.0");
	});
});
