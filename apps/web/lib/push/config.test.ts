import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	isPushConfigured,
	isVapidPrivateKey,
	isVapidPublicKey,
	isVapidSubject,
	readVapidConfig,
} from "./config";

function makeKeypair() {
	const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
	const jwk = privateKey.export({ format: "jwk" });
	const publicKey = Buffer.concat([
		Buffer.from([0x04]),
		Buffer.from(jwk.x as string, "base64url"),
		Buffer.from(jwk.y as string, "base64url"),
	]).toString("base64url");
	return { publicKey, privateKey: Buffer.from(jwk.d as string, "base64url").toString("base64url") };
}

describe("VAPID configuration", () => {
	const keys = makeKeypair();
	const subject = "mailto:ops@example.com";

	it("reports not configured when every value is missing", () => {
		expect(readVapidConfig({})).toBeNull();
		expect(isPushConfigured({})).toBe(false);
	});

	it("reports not configured for the empty .env.example placeholders", () => {
		expect(
			readVapidConfig({
				NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
				VAPID_PRIVATE_KEY: "",
				VAPID_SUBJECT: "",
			}),
		).toBeNull();
	});

	it("accepts a real keypair and trims whitespace", () => {
		const config = readVapidConfig({
			NEXT_PUBLIC_VAPID_PUBLIC_KEY: ` ${keys.publicKey} `,
			VAPID_PRIVATE_KEY: `${keys.privateKey}\n`,
			VAPID_SUBJECT: "  https://example.com/contact  ",
		});
		expect(config).toEqual({
			publicKey: keys.publicKey,
			privateKey: keys.privateKey,
			subject: "https://example.com/contact",
		});
		expect(
			isPushConfigured({
				NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
				VAPID_PRIVATE_KEY: keys.privateKey,
				VAPID_SUBJECT: subject,
			}),
		).toBe(true);
	});

	it("rejects a public key of the wrong length or curve prefix", () => {
		const short = Buffer.from([0x04, 1, 2, 3]).toString("base64url");
		const compressed = Buffer.from(keys.publicKey, "base64url");
		compressed[0] = 0x02;
		expect(isVapidPublicKey(short)).toBe(false);
		expect(isVapidPublicKey(compressed.toString("base64url"))).toBe(false);
		expect(
			readVapidConfig({
				NEXT_PUBLIC_VAPID_PUBLIC_KEY: short,
				VAPID_PRIVATE_KEY: keys.privateKey,
				VAPID_SUBJECT: subject,
			}),
		).toBeNull();
	});

	it("rejects a private key of the wrong length", () => {
		expect(isVapidPrivateKey("not-a-key")).toBe(false);
		expect(isVapidPrivateKey(Buffer.alloc(16, 1).toString("base64url"))).toBe(false);
		expect(
			readVapidConfig({
				NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
				VAPID_PRIVATE_KEY: Buffer.alloc(16, 1).toString("base64url"),
				VAPID_SUBJECT: subject,
			}),
		).toBeNull();
	});

	it("requires a mailto or https subject", () => {
		expect(isVapidSubject("mailto:ops@example.com")).toBe(true);
		expect(isVapidSubject("https://example.com/push")).toBe(true);
		expect(isVapidSubject("ops@example.com")).toBe(false);
		expect(isVapidSubject("mailto:")).toBe(false);
		expect(isVapidSubject("")).toBe(false);
		expect(
			readVapidConfig({
				NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
				VAPID_PRIVATE_KEY: keys.privateKey,
				VAPID_SUBJECT: "ops@example.com",
			}),
		).toBeNull();
	});
});
