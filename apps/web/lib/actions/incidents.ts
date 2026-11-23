"use server";

import { canManageIncidents } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import {
	CANCEL_ALERT_COMMAND_TTL_MS,
	CANCEL_ALERT_ELIGIBLE_STATUSES,
	CANCEL_ALERT_KIND,
	buildCancelAlertPayload,
	canRequestCancelAlert,
} from "@/lib/incidents/cancel-alert";
import { incidentCancelRequestPath, incidentSuccessPath } from "@/lib/incidents/return-to";
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
	const returnTo = value(formData, "returnTo");
	const fromDashboard = returnTo === "dashboard";
	const current = await requireUser();

	if (!canManageIncidents(current.role)) {
		redirect(
			fromDashboard
				? `/${locale}/dashboard?error=forbidden`
				: `/${locale}/incidents/${incidentId}?error=forbidden`,
		);
	}

	const incident = await prisma.impactEvent.findFirst({
		where: { id: incidentId, orgId: current.org.id },
		include: { vehicle: { select: { ownerId: true } } },
	});
	if (!incident) {
		redirect(
			fromDashboard ? `/${locale}/dashboard?error=notfound` : `/${locale}/incidents?error=notfound`,
		);
	}
	if (current.role === "USER" && incident.vehicle.ownerId !== current.user.id) {
		redirect(
			fromDashboard
				? `/${locale}/dashboard?error=forbidden`
				: `/${locale}/incidents/${incidentId}?error=forbidden`,
		);
	}

	// The legacy local transitions stay for a driver-cancelled incident, but a
	// live incident must go through CANCEL_ALERT so the tracker actually stops.
	if (
		(to === "FALSE_ALARM" || to === "CANCELLED") &&
		canRequestCancelAlert(incident.status as ImpactStatusName)
	) {
		redirect(
			fromDashboard
				? `/${locale}/dashboard?error=tracker_required`
				: `/${locale}/incidents/${incident.id}?error=tracker_required`,
		);
	}

	if (!canTransition(incident.status as ImpactStatusName, to)) {
		redirect(
			fromDashboard
				? `/${locale}/dashboard?error=transition`
				: `/${locale}/incidents/${incident.id}?error=transition`,
		);
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
	redirect(incidentSuccessPath(locale, incident.id, returnTo));
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

/**
 * Ask the tracker to stand down without pretending it already did.
 *
 * This is deliberately separate from `cancelIncidentAction`: the old action
 * writes CANCELLED immediately, which is only honest before the tracker starts
 * alerting. Here the incident keeps its status, `cancelRequestedAt` records the
 * request, and a CANCEL_ALERT command goes to the device. The ACK route sets
 * FALSE_ALARM only after the tracker confirms.
 */
export async function requestCancelAlertAction(formData: FormData) {
	const locale = value(formData, "locale") === "tl" ? "tl" : "en";
	const incidentId = value(formData, "incidentId");
	const returnTo = value(formData, "returnTo");
	const fromDashboard = returnTo === "dashboard";
	const intent = value(formData, "intent") === "cancel" ? "cancel" : "false_alarm";
	const current = await requireUser();

	const forbiddenPath = fromDashboard
		? `/${locale}/dashboard?error=forbidden`
		: `/${locale}/incidents/${incidentId}?error=forbidden`;
	if (!canManageIncidents(current.role)) redirect(forbiddenPath);

	const incident = await prisma.impactEvent.findFirst({
		where: { id: incidentId, orgId: current.org.id },
		include: { vehicle: { select: { ownerId: true } } },
	});
	if (!incident) {
		redirect(
			fromDashboard ? `/${locale}/dashboard?error=notfound` : `/${locale}/incidents?error=notfound`,
		);
	}
	if (current.role === "USER" && incident.vehicle.ownerId !== current.user.id) {
		redirect(forbiddenPath);
	}

	const transitionPath = fromDashboard
		? `/${locale}/dashboard?error=transition`
		: `/${locale}/incidents/${incident.id}?error=transition`;
	if (!canRequestCancelAlert(incident.status as ImpactStatusName)) redirect(transitionPath);

	const now = new Date();
	const result = await prisma.$transaction(async (tx) => {
		// Claim the request in the same write that records it. A terminal status
		// from a concurrent operator wins instead of receiving a stale command.
		// The update also locks the incident row, so a double submit serialises
		// here and the second one sees the command the first one created.
		const claimed = await tx.impactEvent.updateMany({
			where: {
				id: incident.id,
				orgId: current.org.id,
				status: { in: [...CANCEL_ALERT_ELIGIBLE_STATUSES] },
			},
			data: { cancelRequestedAt: now },
		});
		if (claimed.count !== 1) return "blocked" as const;

		const liveCommand = await tx.deviceCommand.findFirst({
			where: {
				impactEventId: incident.id,
				kind: CANCEL_ALERT_KIND,
				status: "PENDING",
				OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
			},
			select: { id: true },
		});
		if (liveCommand) return "duplicate" as const;

		await tx.deviceCommand.create({
			data: {
				deviceId: incident.deviceId,
				impactEventId: incident.id,
				kind: CANCEL_ALERT_KIND,
				// The device compares this with its own g_incidentId (`llk-...`).
				payload: buildCancelAlertPayload(incident.clientIncidentId),
				createdAt: now,
				expiresAt: new Date(now.getTime() + CANCEL_ALERT_COMMAND_TTL_MS),
			},
		});
		await tx.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action:
					intent === "cancel" ? "incident.cancel_requested" : "incident.false_alarm_requested",
				target: incident.id,
				metadata: {
					from: incident.status,
					intent,
					deviceId: incident.deviceId,
					clientIncidentId: incident.clientIncidentId,
				},
			},
		});
		return "created" as const;
	});
	if (result === "blocked") redirect(transitionPath);

	revalidatePath(`/${locale}/dashboard`);
	revalidatePath(`/${locale}/incidents`);
	revalidatePath(`/${locale}/incidents/${incident.id}`);
	redirect(incidentCancelRequestPath(locale, incident.id, returnTo));
}
