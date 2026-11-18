import "server-only";

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import prisma from "@/lib/prisma";
import { SignJWT, jwtVerify } from "jose";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type MemberRoleName = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";

export interface SessionPayload {
	sub: string;
	orgId: string;
	role: MemberRoleName;
	email: string;
	name: string;
}

function secretKey(): Uint8Array {
	const secret = process.env.AUTH_SECRET?.trim();
	if (!secret) {
		// A dev fallback keeps `next dev` usable without a full env setup, but a
		// deployment without AUTH_SECRET is a configuration error we surface loudly.
		if (process.env.NODE_ENV === "production") {
			throw new Error("AUTH_SECRET is required in production.");
		}
		return new TextEncoder().encode("lifelink-dev-only-secret-change-me");
	}
	return new TextEncoder().encode(secret);
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
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: SESSION_MAX_AGE_SECONDS,
	});
}

export async function getSession(): Promise<SessionPayload | null> {
	const store = await cookies();
	const token = store.get(SESSION_COOKIE)?.value;
	if (!token) return null;

	try {
		const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
		if (
			typeof payload.sub !== "string" ||
			typeof payload.orgId !== "string" ||
			typeof payload.role !== "string" ||
			typeof payload.email !== "string" ||
			typeof payload.name !== "string"
		) {
			return null;
		}
		return {
			sub: payload.sub,
			orgId: payload.orgId,
			role: payload.role as MemberRoleName,
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

export function canWrite(role: MemberRoleName): boolean {
	return role === "OWNER" || role === "ADMIN" || role === "OPERATOR";
}

export function canAdminister(role: MemberRoleName): boolean {
	return role === "OWNER" || role === "ADMIN";
}
