"use server";

import { verifyPassword } from "@/lib/auth/password";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { PLATFORM_ORG_REINSTATED, PLATFORM_ORG_SUSPENDED } from "@/lib/platform/orgs";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * Platform organization lifecycle actions.
 *
 * Every mutation is platform-admin only, requires a reason, requires the
 * operator to re-enter their current password, and writes one audit row with
 * the actor, organization, reason and before/after status. The action returns
 * a generic `forbidden` when the environment gate is closed, so a closed
 * console is indistinguishable from a missing account.
 */

export type PlatformActionError =
	| "forbidden"
	| "invalid"
	| "password"
	| "notfound"
	| "already"
	| "rate";

export interface PlatformActionState {
	ok: boolean;
	error?: PlatformActionError;
}

const mutationSchema = z.object({
	orgId: z.string().trim().min(1).max(64),
	reason: z.string().trim().min(5).max(500),
	password: z.string().min(1).max(200),
});

function localeFrom(formData: FormData): string {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

type StepUp =
	| { error: PlatformActionError }
	| {
			admin: { id: string; email: string; name: string };
			data: z.infer<typeof mutationSchema>;
	  };

/**
 * Re-authenticate the operator before a privileged mutation. The password is
 * verified against the platform admin's own `User` row, never against a value
 * in the form or the session. The rate limit is per platform user.
 */
async function stepUp(formData: FormData): Promise<StepUp> {
	const admin = await getPlatformAdmin();
	if (!admin) return { error: "forbidden" };

	const parsed = mutationSchema.safeParse({
		orgId: String(formData.get("orgId") ?? ""),
		reason: String(formData.get("reason") ?? ""),
		password: String(formData.get("password") ?? ""),
	});
	if (!parsed.success) return { error: "invalid" };

	const limit = rateLimit(`platform-step-up:${admin.id}`, 5, 10 * 60 * 1000);
	if (!limit.allowed) return { error: "rate" };

	const user = await prisma.user.findUnique({
		where: { id: admin.id },
		select: { passwordHash: true },
	});
	if (!user) return { error: "forbidden" };

	let passwordOk = false;
	try {
		passwordOk = await verifyPassword(parsed.data.password, user.passwordHash);
	} catch {
		passwordOk = false;
	}
	if (!passwordOk) return { error: "password" };

	return { admin, data: parsed.data };
}

export async function suspendOrganizationAction(
	_previous: PlatformActionState,
	formData: FormData,
): Promise<PlatformActionState> {
	const checked = await stepUp(formData);
	if ("error" in checked) return { ok: false, error: checked.error };

	const locale = localeFrom(formData);
	const now = new Date();
	const result = await prisma.$transaction(async (tx) => {
		const org = await tx.organization.findUnique({
			where: { id: checked.data.orgId },
			select: { id: true, name: true, status: true },
		});
		if (!org) return { error: "notfound" as const };
		if (org.status === "SUSPENDED") return { error: "already" as const };

		await tx.organization.update({
			where: { id: org.id },
			data: {
				status: "SUSPENDED",
				suspendedAt: now,
				suspendedReason: checked.data.reason,
				suspendedBy: checked.admin.id,
			},
		});
		await tx.auditLog.create({
			data: {
				orgId: org.id,
				actorId: checked.admin.id,
				action: PLATFORM_ORG_SUSPENDED,
				target: org.id,
				metadata: {
					reason: checked.data.reason,
					before: org.status,
					after: "SUSPENDED",
				},
			},
		});
		return { ok: true as const, name: org.name };
	});

	if ("error" in result) return { ok: false, error: result.error };

	revalidatePath(`/${locale}/platform`);
	redirect(`/${locale}/platform?suspended=1`);
}

export async function reinstateOrganizationAction(
	_previous: PlatformActionState,
	formData: FormData,
): Promise<PlatformActionState> {
	const checked = await stepUp(formData);
	if ("error" in checked) return { ok: false, error: checked.error };

	const locale = localeFrom(formData);
	const result = await prisma.$transaction(async (tx) => {
		const org = await tx.organization.findUnique({
			where: { id: checked.data.orgId },
			select: { id: true, name: true, status: true },
		});
		if (!org) return { error: "notfound" as const };
		if (org.status === "ACTIVE") return { error: "already" as const };

		await tx.organization.update({
			where: { id: org.id },
			data: {
				status: "ACTIVE",
				suspendedAt: null,
				suspendedReason: null,
				suspendedBy: null,
			},
		});
		await tx.auditLog.create({
			data: {
				orgId: org.id,
				actorId: checked.admin.id,
				action: PLATFORM_ORG_REINSTATED,
				target: org.id,
				metadata: {
					reason: checked.data.reason,
					before: org.status,
					after: "ACTIVE",
				},
			},
		});
		return { ok: true as const, name: org.name };
	});

	if ("error" in result) return { ok: false, error: result.error };

	revalidatePath(`/${locale}/platform`);
	redirect(`/${locale}/platform?reinstated=1`);
}
