"use server";

import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/schemas";
import { createSession, destroySession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
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
	await destroySession();
	redirect(`/${locale}/login`);
}
