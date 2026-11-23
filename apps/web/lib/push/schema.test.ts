import { afterEach, describe, expect, it, vi } from "vitest";
import {
	PUSH_ENDPOINT_MAX,
	PUSH_USER_AGENT_MAX,
	clampUserAgent,
	decodePushKey,
	pushEndpointProblem,
	pushSubscribeSchema,
	pushUnsubscribeSchema,
	readPushEndpointPolicy,
} from "./schema";

const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const MOZILLA = "https://updates.push.services.mozilla.com/wpush/v2/abc123";
const APPLE = "https://web.push.apple.com/QG-abc123";
const WINDOWS = "https://wns2-par02p.notify.windows.com/w/?token=abc123";

function keyBytes(length: number, first: number): Uint8Array {
	const bytes = new Uint8Array(length).fill(7);
	bytes[0] = first;
	return bytes;
}

const p256dh = Buffer.from(keyBytes(65, 0x04)).toString("base64url");
const auth = Buffer.from(keyBytes(16, 9)).toString("base64url");

function body(overrides: Record<string, unknown> = {}) {
	return {
		endpoint: FCM,
		keys: { p256dh, auth },
		locale: "tl",
		...overrides,
	};
}

function issuesFor(input: unknown): string[] {
	const parsed = pushSubscribeSchema.safeParse(input);
	return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("push endpoint allowlist", () => {
	it("accepts the known push services", () => {
		for (const endpoint of [FCM, MOZILLA, APPLE, WINDOWS]) {
			expect(pushSubscribeSchema.safeParse(body({ endpoint })).success).toBe(true);
		}
	});

	it("rejects loopback and link-local IP literals", () => {
		for (const endpoint of [
			"https://127.0.0.1/send",
			"https://10.0.0.1/send",
			"https://192.168.1.1/send",
			"https://169.254.169.254/latest/meta-data",
			"https://[::1]/send",
			"https://2130706433/send",
		]) {
			expect(pushEndpointProblem(endpoint)).toBe("ip_literal");
			expect(pushSubscribeSchema.safeParse(body({ endpoint })).success).toBe(false);
		}
	});

	it("rejects userinfo", () => {
		const endpoint = "https://user:pass@fcm.googleapis.com/fcm/send/abc";
		expect(pushEndpointProblem(endpoint)).toBe("credentials");
		expect(issuesFor(body({ endpoint }))).toContain("endpoint");
	});

	it("rejects a public host that is not an allowlisted push service", () => {
		const endpoint = "https://push.example.test/send/abc";
		expect(pushEndpointProblem(endpoint)).toBe("host_not_allowed");
		const parsed = pushSubscribeSchema.safeParse(body({ endpoint }));
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.flatten().fieldErrors.endpoint?.[0]).toBe(
				"This push service is not allowed.",
			);
		}
	});

	it("rejects non-default ports and plain HTTP", () => {
		expect(pushEndpointProblem("https://fcm.googleapis.com:8443/send")).toBe("port");
		expect(pushEndpointProblem("http://fcm.googleapis.com/send")).toBe("https_required");
		expect(pushEndpointProblem("javascript:alert(1)")).toBe("https_required");
		expect(pushEndpointProblem("not a url")).toBe("invalid_url");
	});

	it("accepts a deliberate self-hosted host from the environment", () => {
		vi.stubEnv("WEB_PUSH_ALLOWED_HOSTS", "push.internal.example");
		expect(pushEndpointProblem("https://push.internal.example/send/1")).toBeNull();
		expect(
			pushSubscribeSchema.safeParse(body({ endpoint: "https://push.internal.example/s" })).success,
		).toBe(true);
	});

	it("supports a wildcard entry and ignores malformed entries", () => {
		vi.stubEnv("WEB_PUSH_ALLOWED_HOSTS", "*.push.internal.example,127.0.0.1,http://bad,*.1.2.3.4");
		const policy = readPushEndpointPolicy();
		expect(policy.suffixes).toContain(".push.internal.example");
		expect(pushEndpointProblem("https://a.push.internal.example/send")).toBeNull();
		expect(pushEndpointProblem("https://127.0.0.1/send")).toBe("ip_literal");
		expect(pushEndpointProblem("https://bad/send")).toBe("host_not_allowed");
	});

	it("rejects an endpoint longer than the column budget", () => {
		const endpoint = `https://fcm.googleapis.com/${"a".repeat(PUSH_ENDPOINT_MAX)}`;
		expect(pushSubscribeSchema.safeParse(body({ endpoint })).success).toBe(false);
	});
});

describe("push keys", () => {
	it("accepts a 65-byte uncompressed point and a 16-byte auth secret", () => {
		expect(decodePushKey(p256dh)).toHaveLength(65);
		expect(decodePushKey(auth)).toHaveLength(16);
		expect(pushSubscribeSchema.safeParse(body()).success).toBe(true);
	});

	it("rejects a p256dh of the wrong length or prefix", () => {
		const short = Buffer.from(keyBytes(64, 0x04)).toString("base64url");
		const compressed = Buffer.from(keyBytes(65, 0x02)).toString("base64url");
		expect(issuesFor(body({ keys: { p256dh: short, auth } }))).toContain("keys.p256dh");
		expect(issuesFor(body({ keys: { p256dh: compressed, auth } }))).toContain("keys.p256dh");
	});

	it("rejects an auth secret that is not 16 bytes", () => {
		const fifteen = Buffer.from(keyBytes(15, 1)).toString("base64url");
		const seventeen = Buffer.from(keyBytes(17, 1)).toString("base64url");
		expect(issuesFor(body({ keys: { p256dh, auth: fifteen } }))).toContain("keys.auth");
		expect(issuesFor(body({ keys: { p256dh, auth: seventeen } }))).toContain("keys.auth");
	});

	it("rejects missing and malformed keys", () => {
		expect(pushSubscribeSchema.safeParse({ endpoint: FCM }).success).toBe(false);
		expect(pushSubscribeSchema.safeParse(body({ keys: { auth } })).success).toBe(false);
		expect(
			pushSubscribeSchema.safeParse(body({ keys: { p256dh: "not base64!", auth } })).success,
		).toBe(false);
	});

	it("trims the endpoint and keys", () => {
		const parsed = pushSubscribeSchema.safeParse(
			body({
				endpoint: `  ${FCM}  `,
				keys: { p256dh: ` ${p256dh} `, auth: ` ${auth} ` },
			}),
		);
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.endpoint).toBe(FCM);
	});

	it("accepts only the supported locales", () => {
		expect(pushSubscribeSchema.safeParse(body({ locale: "en" })).success).toBe(true);
		expect(pushSubscribeSchema.safeParse(body({ locale: "de" })).success).toBe(false);
	});
});

describe("push unsubscribe schema", () => {
	it("stays permissive so a legacy row can be revoked", () => {
		expect(
			pushUnsubscribeSchema.safeParse({ endpoint: "https://push.example.test/old" }).success,
		).toBe(true);
	});

	it("still requires HTTPS", () => {
		expect(pushUnsubscribeSchema.safeParse({ endpoint: "http://x.test/y" }).success).toBe(false);
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
