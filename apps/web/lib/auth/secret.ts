/**
 * Session secret and cookie policy.
 *
 * Kept separate from `session.ts` so the policy is testable without importing
 * `next/headers` or opening a database client. Production fails closed: a
 * missing or short secret is a deployment error, never the development value.
 */

export const MIN_AUTH_SECRET_BYTES = 32;

/** Development-only fallback. Never used when NODE_ENV is production. */
export const DEV_AUTH_SECRET = "lifelink-dev-only-secret-change-me";

type Env = Record<string, string | undefined>;

function secretBytes(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

export function resolveAuthSecret(env: Env = process.env): Uint8Array {
	const secret = env.AUTH_SECRET?.trim();

	if (env.NODE_ENV === "production") {
		if (!secret) {
			throw new Error("AUTH_SECRET is required in production.");
		}
		if (secretBytes(secret).length < MIN_AUTH_SECRET_BYTES) {
			throw new Error(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_BYTES} bytes in production.`);
		}
		return secretBytes(secret);
	}

	return secretBytes(secret || DEV_AUTH_SECRET);
}

/**
 * Secure cookies are mandatory in production. Outside production an HTTPS
 * site URL still needs the flag, otherwise a real deployment started with
 * NODE_ENV=development would send the session over plain HTTP.
 */
export function shouldUseSecureSessionCookie(env: Env = process.env): boolean {
	if (env.NODE_ENV === "production") return true;

	const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
	if (siteUrl && /^https:\/\//i.test(siteUrl)) return true;

	const vercelUrl = env.VERCEL_URL?.trim();
	if (vercelUrl) {
		if (/^https?:\/\//i.test(vercelUrl)) return /^https:\/\//i.test(vercelUrl);
		// Vercel supplies a hostname without a scheme; deployed hosts are HTTPS.
		return true;
	}

	return false;
}
