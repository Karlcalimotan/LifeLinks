"use server";

import { canAdminister, requireUser } from "@/lib/auth/session";
import { validateFirmwareConfig } from "@/lib/firmware/config";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

function localeFrom(formData: FormData): "en" | "tl" {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

function thresholdFrom(formData: FormData): number {
	const raw = formData.get("threshold");
	return typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
}

/**
 * Quick dashboard editor for the crash impact threshold. The full settings form
 * owns every other field; this action deliberately writes only impactThresholdG.
 */
export async function updateImpactThresholdAction(formData: FormData): Promise<void> {
	const locale = localeFrom(formData);

	const current = await requireUser();
	if (!canAdminister(current.role)) {
		redirect(`/${locale}/dashboard?error=threshold_forbidden`);
	}

	const threshold = thresholdFrom(formData);
	const { ok } = validateFirmwareConfig({ impactThresholdG: threshold });
	if (!ok) {
		redirect(`/${locale}/dashboard?error=threshold`);
	}

	await prisma.$transaction([
		prisma.orgSettings.upsert({
			where: { orgId: current.org.id },
			create: { orgId: current.org.id, impactThresholdG: threshold },
			update: { impactThresholdG: threshold },
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "settings.impact_threshold.updated",
				target: current.org.id,
				metadata: { impactThresholdG: threshold },
			},
		}),
	]);

	revalidateTag("org-settings", "max");
	revalidatePath(`/${locale}/dashboard`);
	revalidatePath(`/${locale}/settings`);
	revalidatePath(`/${locale}/devices`);
	redirect(`/${locale}/dashboard?updated=threshold`);
}
