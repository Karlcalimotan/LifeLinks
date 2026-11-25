import "server-only";

import { PLATFORM_SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { resolveAuthSecret, shouldUseSecureSessionCookie } from "./secret";

/**
 * The platform session is a separate JWT and a separate cookie from the tenant
 * session. It carries no `orgId` and no `role`, so it cannot be used by any
 * tenant page or action, and a tenant JWT cannot be replayed as a platform
 * session because the `scope` claim is checked.
 */
export interface PlatformSessionPayload {
	sub: string;
	email: string;
	name: string;
}

function secretKey(): Uint8Array {
	return resolveAuthSecret();
}

export async function createPlatformSession(payload: PlatformSessionPayload): Promise<void> {
	const token = await new SignJWT({ ...payload, scope: "platform" })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(payload.sub)
		.setIssuedAt()
		.setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
		.sign(secretKey());

	const store = await cookies();
	store.set(PLATFORM_SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureSessionCookie(),
		path: "/",
		maxAge: SESSION_MAX_AGE_SECONDS,
	});
}

export async function getPlatformSession(): Promise<PlatformSessionPayload | null> {
	const store = await cookies();
	const token = store.get(PLATFORM_SESSION_COOKIE)?.value;
	if (!token) return null;

	const key = secretKey();

	try {
		const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
		if (
			payload.scope !== "platform" ||
			typeof payload.sub !== "string" ||
			typeof payload.email !== "string" ||
			typeof payload.name !== "string"
		) {
			return null;
		}
		return { sub: payload.sub, email: payload.email, name: payload.name };
	} catch {
		return null;
	}
}

export async function destroyPlatformSession(): Promise<void> {
	const store = await cookies();
	store.delete(PLATFORM_SESSION_COOKIE);
}
