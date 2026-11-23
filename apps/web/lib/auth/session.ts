import "server-only";

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import prisma from "@/lib/prisma";
import { SignJWT, jwtVerify } from "jose";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type MemberRoleName, isMemberRole } from "./roles";
import { resolveAuthSecret, shouldUseSecureSessionCookie } from "./secret";

export type { MemberRoleName };
export {
	MEMBER_ROLES,
	canAcknowledgeAsBureau,
	canAdminister,
	canManageIncidents,
	canManageSettings,
	canViewAllVehicles,
	canViewDevices,
	roleLabelKey,
	vehicleRelationScope,
	vehicleScope,
} from "./roles";

export interface SessionPayload {
	sub: string;
	orgId: string;
	role: MemberRoleName;
	email: string;
	name: string;
}

function secretKey(): Uint8Array {
	return resolveAuthSecret();
}

export async function createSession(payload: SessionPayload): Promise<void> {
	const token = await new SignJWT({ ...payload })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(payload.sub)
		.setIssuedAt()
		.setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
		.sign(secretKey());

	const store = await cookies();
	store.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureSessionCookie(),
		path: "/",
		maxAge: SESSION_MAX_AGE_SECONDS,
	});
}

export async function getSession(): Promise<SessionPayload | null> {
	const store = await cookies();
	const token = store.get(SESSION_COOKIE)?.value;
	if (!token) return null;

	// Resolve the key before the try block: a production configuration error
	// must surface as an error, not as a silent "signed out" response.
	const key = secretKey();

	try {
		const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
		if (
			typeof payload.sub !== "string" ||
			typeof payload.orgId !== "string" ||
			!isMemberRole(payload.role) ||
			typeof payload.email !== "string" ||
			typeof payload.name !== "string"
		) {
			return null;
		}
		return {
			sub: payload.sub,
			orgId: payload.orgId,
			role: payload.role,
			email: payload.email,
			name: payload.name,
		};
	} catch {
		return null;
	}
}

export async function destroySession(): Promise<void> {
	const store = await cookies();
	store.delete(SESSION_COOKIE);
}

export interface CurrentUser {
	session: SessionPayload;
	user: { id: string; email: string; name: string };
	org: { id: string; name: string; slug: string };
	role: MemberRoleName;
}

/**
 * Resolve the session against the database on every request. The JWT says who
 * the user claimed to be; the membership row says what they may still do. A
 * revoked membership therefore takes effect on the next request, not when the
 * cookie expires.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
	const session = await getSession();
	if (!session) return null;

	const membership = await prisma.membership.findUnique({
		where: { orgId_userId: { orgId: session.orgId, userId: session.sub } },
		include: { user: true, org: true },
	});
	if (!membership) return null;

	return {
		session,
		user: {
			id: membership.user.id,
			email: membership.user.email,
			name: membership.user.name,
		},
		org: {
			id: membership.org.id,
			name: membership.org.name,
			slug: membership.org.slug,
		},
		role: membership.role,
	};
}

export async function requireUser(): Promise<CurrentUser> {
	const current = await getCurrentUser();
	if (!current) {
		const locale = await getLocale().catch(() => "en");
		redirect(`/${locale}/login`);
	}
	return current;
}

export async function requireRole(...allowed: MemberRoleName[]): Promise<CurrentUser> {
	const current = await requireUser();
	if (!allowed.includes(current.role)) {
		const locale = await getLocale().catch(() => "en");
		redirect(`/${locale}/dashboard`);
	}
	return current;
}
