"use server";

import { canManageIncidents } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { type ImpactStatusName, canTransition } from "@/lib/incidents/state";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function value(formData: FormData, key: string): string {
	return String(formData.get(key) ?? "").trim();
}

async function transition(formData: FormData, to: ImpactStatusName) {
	const locale = value(formData, "locale") === "tl" ? "tl" : "en";
	const incidentId = value(formData, "incidentId");
	const current = await requireUser();

	if (!canManageIncidents(current.role)) {
		redirect(`/${locale}/incidents/${incidentId}?error=forbidden`);
	}

	const incident = await prisma.impactEvent.findFirst({
		where: { id: incidentId, orgId: current.org.id },
		include: { vehicle: { select: { ownerId: true } } },
	});
	if (!incident) redirect(`/${locale}/incidents?error=notfound`);
	if (current.role === "USER" && incident.vehicle.ownerId !== current.user.id) {
		redirect(`/${locale}/incidents/${incidentId}?error=forbidden`);
	}

	if (!canTransition(incident.status as ImpactStatusName, to)) {
		redirect(`/${locale}/incidents/${incident.id}?error=transition`);
	}

	const now = new Date();
	const resolution =
		to === "RESOLVED"
			? value(formData, "resolution") || "Resolved by operator"
			: to === "FALSE_ALARM"
				? "False alarm"
				: to === "CANCELLED"
					? "Cancelled by operator"
					: incident.resolution;

	await prisma.$transaction([
		prisma.impactEvent.update({
			where: { id: incident.id },
			data: {
				status: to,
				resolution,
				resolvedAt: to === "RESOLVED" || to === "FALSE_ALARM" ? now : incident.resolvedAt,
				cancelledAt: to === "CANCELLED" ? now : incident.cancelledAt,
			},
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: `incident.${to.toLowerCase()}`,
				target: incident.id,
				metadata: { from: incident.status, to },
			},
		}),
	]);

	revalidatePath(`/${locale}/dashboard`);
	revalidatePath(`/${locale}/incidents`);
	revalidatePath(`/${locale}/incidents/${incident.id}`);
	redirect(`/${locale}/incidents/${incident.id}?updated=1`);
}

export async function acknowledgeIncidentAction(formData: FormData) {
	await transition(formData, "ACKNOWLEDGED");
}

export async function resolveIncidentAction(formData: FormData) {
	await transition(formData, "RESOLVED");
}

export async function falseAlarmAction(formData: FormData) {
	await transition(formData, "FALSE_ALARM");
}

export async function cancelIncidentAction(formData: FormData) {
	await transition(formData, "CANCELLED");
}
