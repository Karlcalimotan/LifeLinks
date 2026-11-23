"use server";

import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/schemas";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
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
		include: { memberships: { include: { org: true }, take: 1 } },
	});
	const passwordOk = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
	const membership = user?.memberships[0];

	if (!user || !passwordOk || !membership) {
		redirect(`/${locale}/login?error=invalid`);
	}

	await createSession({
		sub: user.id,
		orgId: membership.orgId,
		role: membership.role,
		email: user.email,
		name: user.name,
	});

	redirect(`/${locale}/dashboard`);
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

	await destroySession();
	redirect(`/${locale}/login`);
}
