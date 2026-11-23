import "server-only";

/**
 * VAPID configuration for Web Push. The browser needs only the public key
 * (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, inlined at build time); the private key and
 * subject stay on the server (`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
 *
 * Keys are validated instead of trusted: a placeholder value in `.env` must
 * read as "not configured", not as a broken sender that fails at delivery
 * time. The public key is the base64url of an uncompressed P-256 point (65
 * bytes starting with 0x04); the private key is the 32-byte scalar. These are
 * exactly the formats `web-push` generates and expects.
 */

export interface VapidConfig {
	publicKey: string;
	privateKey: string;
	subject: string;
}

export type PushEnv = Record<string, string | undefined>;

export const VAPID_PUBLIC_KEY_BYTES = 65;
export const VAPID_PRIVATE_KEY_BYTES = 32;
export const VAPID_UNCOMPRESSED_POINT_PREFIX = 0x04;

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function decodeBase64Url(value: string): Uint8Array | null {
	if (!BASE64URL.test(value)) return null;
	try {
		return new Uint8Array(Buffer.from(value, "base64url"));
	} catch {
		return null;
	}
}

export function isVapidPublicKey(value: string): boolean {
	const bytes = decodeBase64Url(value);
	return (
		bytes !== null &&
		bytes.length === VAPID_PUBLIC_KEY_BYTES &&
		bytes[0] === VAPID_UNCOMPRESSED_POINT_PREFIX
	);
}

export function isVapidPrivateKey(value: string): boolean {
	const bytes = decodeBase64Url(value);
	return bytes !== null && bytes.length === VAPID_PRIVATE_KEY_BYTES;
}

/** VAPID requires a contact: a `mailto:` address or an `https:` URL. */
export function isVapidSubject(value: string): boolean {
	if (value.startsWith("mailto:")) return value.length > "mailto:".length + 3;
	if (value.startsWith("https://")) return value.length > "https://".length + 3;
	return false;
}

export function readVapidConfig(env: PushEnv = process.env): VapidConfig | null {
	const publicKey = (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
	const privateKey = (env.VAPID_PRIVATE_KEY ?? "").trim();
	const subject = (env.VAPID_SUBJECT ?? "").trim();

	if (!isVapidPublicKey(publicKey)) return null;
	if (!isVapidPrivateKey(privateKey)) return null;
	if (!isVapidSubject(subject)) return null;

	return { publicKey, privateKey, subject };
}

export function isPushConfigured(env: PushEnv = process.env): boolean {
	return readVapidConfig(env) !== null;
}
