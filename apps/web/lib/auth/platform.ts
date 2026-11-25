import "server-only";

import { isPlatformAdminEnabled } from "@/lib/platform/gate";
import prisma from "@/lib/prisma";
import { getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { getPlatformSession } from "./platform-session";

/**
 * Resolve a platform administrator from the separate platform session and the
 * `PlatformAdmin` row. This is the only platform authorization path:
 *
 * - the tenant session is irrelevant here, so a tenant ADMIN has no access;
 * - a platform admin without a `Membership` has no tenant access either,
 *   because every tenant page and action still goes through `getCurrentUser`;
 * - the environment gate is checked first, so a closed gate is indistinguishable
 *   from a missing account.
 */
export interface PlatformAdminUser {
	id: string;
	email: string;
	name: string;
}

export async function getPlatformAdmin(): Promise<PlatformAdminUser | null> {
	if (!isPlatformAdminEnabled()) return null;

	const session = await getPlatformSession();
	if (!session) return null;

	const admin = await prisma.platformAdmin.findUnique({
		where: { userId: session.sub },
		select: {
			userId: true,
			user: { select: { id: true, email: true, name: true } },
		},
	});
	if (!admin) return null;

	return admin.user;
}

/**
 * Page guard for `/platform`. A closed gate returns not-found rather than a
 * login page, so the console's existence is not advertised. A missing session
 * redirects to the ordinary login, where the platform admin signs in.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminUser> {
	const admin = await getPlatformAdmin();
	if (admin) return admin;

	if (!isPlatformAdminEnabled()) notFound();

	const locale = await getLocale().catch(() => "en");
	redirect(`/${locale}/login`);
}
