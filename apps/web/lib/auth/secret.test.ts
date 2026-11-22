import { describe, expect, it } from "vitest";
import {
	DEV_AUTH_SECRET,
	MIN_AUTH_SECRET_BYTES,
	resolveAuthSecret,
	shouldUseSecureSessionCookie,
} from "./secret";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("auth secret policy", () => {
	it("fails closed in production when the secret is missing", () => {
		expect(() => resolveAuthSecret({ NODE_ENV: "production" })).toThrow(
			/AUTH_SECRET is required in production/,
		);
	});

	it("rejects a production secret shorter than 32 bytes", () => {
		expect(() =>
			resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "x".repeat(31) }),
		).toThrow(new RegExp(`at least ${MIN_AUTH_SECRET_BYTES} bytes`));
	});

	it("accepts a 32-byte production secret and ignores surrounding spaces", () => {
		const secret = "x".repeat(32);
		expect(
			decode(resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: `  ${secret}  ` })),
		).toBe(secret);
	});

	it("counts UTF-8 bytes, not characters", () => {
		expect(() =>
			resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "é".repeat(15) }),
		).toThrow(/at least 32 bytes/);
		expect(decode(resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "é".repeat(16) }))).toBe(
			"é".repeat(16),
		);
	});

	it("uses the development fallback only outside production", () => {
		expect(decode(resolveAuthSecret({ NODE_ENV: "development" }))).toBe(DEV_AUTH_SECRET);
		expect(decode(resolveAuthSecret({ NODE_ENV: "test", AUTH_SECRET: "short" }))).toBe("short");
	});

	it("marks the cookie secure in production", () => {
		expect(shouldUseSecureSessionCookie({ NODE_ENV: "production" })).toBe(true);
	});

	it("marks the cookie secure when the configured site URL is HTTPS", () => {
		expect(
			shouldUseSecureSessionCookie({
				NODE_ENV: "development",
				NEXT_PUBLIC_SITE_URL: "https://lifelink.example",
			}),
		).toBe(true);
		expect(
			shouldUseSecureSessionCookie({
				NODE_ENV: "development",
				NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
			}),
		).toBe(false);
	});

	it("marks the cookie secure for a Vercel deployment host", () => {
		expect(
			shouldUseSecureSessionCookie({
				NODE_ENV: "development",
				VERCEL_URL: "lifelink-preview.vercel.app",
			}),
		).toBe(true);
		expect(
			shouldUseSecureSessionCookie({
				NODE_ENV: "development",
				VERCEL_URL: "http://lifelink-preview.vercel.app",
			}),
		).toBe(false);
	});

	it("leaves the cookie non-secure only for plain local development", () => {
		expect(shouldUseSecureSessionCookie({ NODE_ENV: "development" })).toBe(false);
	});
});
