"use server";

import { verifyPassword } from "@/lib/auth/password";
import { createPlatformSession, destroyPlatformSession } from "@/lib/auth/platform-session";
import { loginSchema } from "@/lib/auth/schemas";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { isPlatformAdminEnabled } from "@/lib/platform/gate";
import prisma from "@/lib/prisma";
import { revokePushOnLogout } from "@/lib/push/revoke";
import { clampUserAgent } from "@/lib/push/schema";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function localeFrom(formData: FormData): string {
	const value = String(formData.get("locale") ?? "en");
	return value === "tl" ? "tl" : "en";
}

export async function loginAction(formData: FormData) {
	// A shared browser must not keep a platform session from a previous user.
	// Clear it before any new session is established, including on a failed
	// login attempt.
	await destroyPlatformSession();

	const locale = localeFrom(formData);
	const parsed = loginSchema.safeParse({
		email: String(formData.get("email") ?? ""),
		password: String(formData.get("password") ?? ""),
	});
	if (!parsed.success) redirect(`/${locale}/login?error=invalid`);

	const headerStore = await headers();
	const ip =
		headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		headerStore.get("x-real-ip") ??
		"local";
	const limit = rateLimit(`login:${parsed.data.email}:${ip}`, 5, 10 * 60 * 1000);
	if (!limit.allowed) redirect(`/${locale}/login?error=rate`);

	const user = await prisma.user.findUnique({
		where: { email: parsed.data.email },
		include: {
			memberships: {
				// A revoked membership is not a way in; an account whose only
				// membership is revoked fails the same generic check as a wrong
				// password.
				where: { revokedAt: null },
				include: { org: { select: { id: true, status: true } } },
				orderBy: { createdAt: "asc" },
			},
			// The platform row is separate from the membership. It is only
			// usable when the environment gate is open.
			platformAdmin: { select: { id: true } },
		},
	});
	const passwordOk = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;

	// Verify the password before saying anything about the organization. A
	// wrong password and an unknown account stay indistinguishable.
	if (!user || !passwordOk) redirect(`/${locale}/login?error=invalid`);

	// Prefer an active organization when the account belongs to more than one.
	// A suspended membership must not hide an active one.
	const membership =
		user.memberships.find((entry) => entry.org.status === "ACTIVE") ?? user.memberships[0];
	const platformAdmin = user.platformAdmin && isPlatformAdminEnabled() ? user.platformAdmin : null;

	if (membership && membership.org.status === "ACTIVE") {
		await createSession({
			sub: user.id,
			orgId: membership.orgId,
			role: membership.role,
			email: user.email,
			name: user.name,
		});
		if (platformAdmin) {
			await createPlatformSession({ sub: user.id, email: user.email, name: user.name });
		}
		redirect(`/${locale}/dashboard`);
	}

	if (platformAdmin) {
		// The platform console is independent of the tenant organization. A
		// platform admin whose only organization is suspended can still sign in
		// here to reinstate it. Clear any stale tenant cookie first.
		await createPlatformSession({ sub: user.id, email: user.email, name: user.name });
		await destroySession();
		redirect(`/${locale}/platform`);
	}

	if (membership && membership.org.status === "SUSPENDED") {
		// The password was correct, so this is the organization's own member.
		// Say that access is unavailable without exposing the internal note.
		redirect(`/${locale}/login?error=suspended`);
	}

	redirect(`/${locale}/login?error=invalid`);
}

/**
 * Platform sign-out. The tenant session is left alone: a user who is both a
 * platform admin and a tenant member keeps their tenant sign-in.
 */
export async function platformLogoutAction(formData: FormData) {
	const locale = localeFrom(formData);
	await destroyPlatformSession();
	redirect(`/${locale}/login`);
}

export async function logoutAction(formData: FormData) {
	const locale = localeFrom(formData);

	// Revoke this browser's push subscription before the session disappears.
	// The session read, the request headers and the delete all sit inside the
	// try: a misconfigured secret or a failed revocation must never keep the
	// operator signed in.
	const rawEndpoint = String(formData.get("pushEndpoint") ?? "").trim();
	try {
		const session = await getSession();
		if (session) {
			const headerStore = await headers();
			await revokePushOnLogout({
				userId: session.sub,
				orgId: session.orgId,
				endpoint: rawEndpoint.length > 0 && rawEndpoint.length <= 2048 ? rawEndpoint : null,
				userAgent: clampUserAgent(headerStore.get("user-agent")),
			});
		}
	} catch {
		// Signing out is the user's intent; a stale row is not a reason to keep
		// the session open.
	}

	// Signing out of the tenant console also clears the platform session. A
	// shared browser must not leave a privileged 7-day cookie behind for the
	// next person. The platform console's own sign-out clears only its session.
	await destroyPlatformSession();
	await destroySession();
	redirect(`/${locale}/login`);
}
