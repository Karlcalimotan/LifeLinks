"use server";

import { normalizePhone } from "@/lib/alerts/templates";
import { canAdminister, requireUser } from "@/lib/auth/session";
import { CONFIG_FIELDS } from "@/lib/firmware/config";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

function lines(value: FormDataEntryValue | null): string[] {
	return String(value ?? "")
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function num(formData: FormData, key: string): number {
	return Number(formData.get(key));
}

const settingsSchema = z.object({
	orgName: z.string().trim().min(2, "Enter an organization name.").max(120),
	impactThresholdG: z.number().min(1.5).max(5),
	tiltThresholdDeg: z.number().min(30).max(90),
	confirmWindowMs: z.number().int().min(100).max(2000),
	cancelWindowS: z.number().int().min(5).max(60),
	heartbeatIntervalS: z.number().int().min(10).max(300),
	sosRetryS: z.number().int().min(30).max(300),
	telemetryRetentionDays: z.number().int().min(1).max(3650),
	incidentRetentionDays: z.number().int().min(1).max(3650),
});

export async function updateSettingsAction(formData: FormData) {
	const locale = String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
	const current = await requireUser();
	if (!canAdminister(current.role)) {
		redirect(`/${locale}/settings?error=forbidden`);
	}

	const phones = lines(formData.get("phones"))
		.map(normalizePhone)
		.filter((phone): phone is string => phone != null)
		.slice(0, 20);
	const emails = lines(formData.get("emails"))
		.filter((email) => z.string().email().safeParse(email).success)
		.map((email) => email.toLowerCase())
		.slice(0, 20);

	const parsed = settingsSchema.safeParse({
		orgName: String(formData.get("orgName") ?? ""),
		impactThresholdG: num(formData, "impactThresholdG"),
		tiltThresholdDeg: num(formData, "tiltThresholdDeg"),
		confirmWindowMs: num(formData, "confirmWindowMs"),
		cancelWindowS: num(formData, "cancelWindowS"),
		heartbeatIntervalS: num(formData, "heartbeatIntervalS"),
		sosRetryS: num(formData, "sosRetryS"),
		telemetryRetentionDays: num(formData, "telemetryRetentionDays"),
		incidentRetentionDays: num(formData, "incidentRetentionDays"),
	});
	if (!parsed.success) {
		redirect(`/${locale}/settings?error=invalid`);
	}
	const data = parsed.data;

	for (const field of CONFIG_FIELDS) {
		const value = data[field.key as keyof typeof data];
		if (typeof value === "number" && (value < field.min || value > field.max)) {
			redirect(`/${locale}/settings?error=invalid`);
		}
	}

	await prisma.$transaction([
		prisma.organization.update({
			where: { id: current.org.id },
			data: { name: data.orgName },
		}),
		prisma.orgSettings.upsert({
			where: { orgId: current.org.id },
			create: {
				orgId: current.org.id,
				impactThresholdG: data.impactThresholdG,
				tiltThresholdDeg: data.tiltThresholdDeg,
				confirmWindowMs: data.confirmWindowMs,
				cancelWindowS: data.cancelWindowS,
				heartbeatIntervalS: data.heartbeatIntervalS,
				sosRetryS: data.sosRetryS,
				telemetryRetentionDays: data.telemetryRetentionDays,
				incidentRetentionDays: data.incidentRetentionDays,
				alertPhones: phones,
				alertEmails: emails,
			},
			update: {
				impactThresholdG: data.impactThresholdG,
				tiltThresholdDeg: data.tiltThresholdDeg,
				confirmWindowMs: data.confirmWindowMs,
				cancelWindowS: data.cancelWindowS,
				heartbeatIntervalS: data.heartbeatIntervalS,
				sosRetryS: data.sosRetryS,
				telemetryRetentionDays: data.telemetryRetentionDays,
				incidentRetentionDays: data.incidentRetentionDays,
				alertPhones: phones,
				alertEmails: emails,
			},
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "settings.updated",
				target: current.org.id,
				metadata: { orgName: data.orgName, phoneCount: phones.length, emailCount: emails.length },
			},
		}),
	]);

	revalidateTag("org-settings", "max");
	revalidatePath(`/${locale}/settings`);
	revalidatePath(`/${locale}/dashboard`);
	revalidatePath(`/${locale}/devices`);
	redirect(`/${locale}/settings?saved=1`);
}
