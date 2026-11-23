"use server";

import { canAcknowledgeAsBureau, canManageIncidents } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import {
	ACK_INCIDENT_COMMAND_TTL_MS,
	ACK_INCIDENT_KIND,
	UNCONFIRMED_RESOLUTION,
	acknowledgementRequiredBeforeResolve,
	buildAckIncidentPayload,
	canResolveWithoutTracker,
	latestAckIncidentCommand,
	readAckIncidentDetail,
	readBureauAckState,
} from "@/lib/incidents/bureau-ack";
import {
	CANCEL_ALERT_COMMAND_TTL_MS,
	CANCEL_ALERT_ELIGIBLE_STATUSES,
	CANCEL_ALERT_KIND,
	buildCancelAlertPayload,
	canRequestCancelAlert,
} from "@/lib/incidents/cancel-alert";
import { boundResolution } from "@/lib/incidents/resolution";
import {
	incidentAckRequestPath,
	incidentCancelRequestPath,
	incidentSuccessPath,
} from "@/lib/incidents/return-to";
import { type ImpactStatusName, canTransition } from "@/lib/incidents/state";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function value(formData: FormData, key: string): string {
	return String(formData.get(key) ?? "").trim();
}

/**
 * Thrown inside a transaction when the other command kind is still pending.
 * Throwing rolls back the request claim so a conflicting action leaves no
 * partial state behind.
 */
class CommandConflictError extends Error {}

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
		include: {
			vehicle: { select: { ownerId: true } },
			device: { select: { id: true } },
		},
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

	// The tracker latches its alarm until ACK_INCIDENT. Resolving before the
	// device confirms would tell the operator the alarm is over while it is
	// still sounding, so a dispatched device incident must be acknowledged
	// first. A local incident has no tracker to wait for.
	if (
		to === "RESOLVED" &&
		acknowledgementRequiredBeforeResolve({
			status: incident.status,
			deviceBacked: Boolean(incident.device),
		})
	) {
		redirect(
			fromDashboard
				? `/${locale}/dashboard?error=ack_required`
				: `/${locale}/incidents/${incident.id}?error=ack_required`,
		);
	}

	const now = new Date();
	const resolution =
		to === "RESOLVED"
			? boundResolution(value(formData, "resolution"), "Resolved by operator")
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

/**
 * Acknowledge an incident as the responding bureau.
 *
 * The role gate is deliberate: a vehicle owner may work their own incident,
 * but only `RESPONDER` and `ADMIN` acknowledge on behalf of the bureau.
 *
 * A device-backed `CONFIRMED` incident is dispatched and its tracker alarm is
 * latched. The action queues `ACK_INCIDENT` with the device client incident id
 * and records `ackRequestedAt`; it never sets `ACKNOWLEDGED` itself. The ACK
 * route changes the status only when the tracker confirms. A `SUSPECTED`
 * incident is before dispatch, and an incident without a device has no tracker
 * to ask, so those keep the local acknowledgement path.
 */
export async function acknowledgeIncidentAction(formData: FormData) {
	const locale = value(formData, "locale") === "tl" ? "tl" : "en";
	const incidentId = value(formData, "incidentId");
	const returnTo = value(formData, "returnTo");
	const fromDashboard = returnTo === "dashboard";
	const current = await requireUser();

	const forbiddenPath = fromDashboard
		? `/${locale}/dashboard?error=forbidden`
		: `/${locale}/incidents/${incidentId}?error=forbidden`;
	if (!canAcknowledgeAsBureau(current.role)) redirect(forbiddenPath);

	const incident = await prisma.impactEvent.findFirst({
		where: { id: incidentId, orgId: current.org.id },
		include: {
			vehicle: { select: { ownerId: true } },
			device: { select: { id: true } },
		},
	});
	if (!incident) {
		redirect(
			fromDashboard ? `/${locale}/dashboard?error=notfound` : `/${locale}/incidents?error=notfound`,
		);
	}
	// Keep the owner scope even though the bureau gate already excludes USER.
	if (current.role === "USER" && incident.vehicle.ownerId !== current.user.id) {
		redirect(forbiddenPath);
	}

	const transitionPath = fromDashboard
		? `/${locale}/dashboard?error=transition`
		: `/${locale}/incidents/${incident.id}?error=transition`;
	const commandConflictPath = fromDashboard
		? `/${locale}/dashboard?error=command_conflict`
		: `/${locale}/incidents/${incident.id}?error=command_conflict`;
	if (!canTransition(incident.status as ImpactStatusName, "ACKNOWLEDGED")) {
		redirect(transitionPath);
	}

	const now = new Date();
	const deviceBacked = Boolean(incident.device);

	if (!deviceBacked) {
		// No tracker to ask: record the acknowledgement locally. The conditional
		// update keeps a concurrent terminal transition from being overwritten.
		const claimed = await prisma.$transaction(async (tx) => {
			const updated = await tx.impactEvent.updateMany({
				where: {
					id: incident.id,
					orgId: current.org.id,
					status: { in: ["SUSPECTED", "CONFIRMED"] },
					resolution: null,
				},
				data: { status: "ACKNOWLEDGED", ackRequestedAt: null },
			});
			if (updated.count !== 1) return false;
			await tx.auditLog.create({
				data: {
					orgId: current.org.id,
					actorId: current.user.id,
					action: "incident.acknowledged",
					target: incident.id,
					metadata: {
						from: incident.status,
						to: "ACKNOWLEDGED",
						source: "operator",
						deviceId: incident.deviceId,
					},
				},
			});
			return true;
		});
		if (!claimed) redirect(transitionPath);

		revalidatePath(`/${locale}/dashboard`);
		revalidatePath(`/${locale}/incidents`);
		revalidatePath(`/${locale}/incidents/${incident.id}`);
		redirect(incidentSuccessPath(locale, incident.id, returnTo));
	}

	// A device-backed SUSPECTED incident is still in the tracker's cancel
	// window. The firmware rejects ACK_INCIDENT during Countdown, so setting
	// ACKNOWLEDGED locally would be a lie. Refuse and explain.
	if (incident.status === "SUSPECTED") {
		redirect(
			fromDashboard
				? `/${locale}/dashboard?error=ack_not_dispatched`
				: `/${locale}/incidents/${incident.id}?error=ack_not_dispatched`,
		);
	}

	// The remaining eligible status is a dispatched CONFIRMED incident. Queue
	// ACK_INCIDENT; only the tracker may move it to ACKNOWLEDGED.
	let result: "blocked" | "duplicate" | "created";
	try {
		result = await prisma.$transaction(async (tx) => {
			// Claim the request in the same write that records it. A terminal status
			// from a concurrent operator wins instead of receiving a stale command.
			// The update also locks the incident row, so a double submit serialises
			// here and the second one sees the command the first one created.
			const claimed = await tx.impactEvent.updateMany({
				where: {
					id: incident.id,
					orgId: current.org.id,
					status: "CONFIRMED",
					resolution: null,
				},
				data: { ackRequestedAt: now },
			});
			if (claimed.count !== 1) return "blocked" as const;

			// A stand-down is already waiting for the same tracker. Sending an
			// acknowledgement as well would put two contradictory commands in
			// flight, so refuse and let the operator wait for the answer.
			const conflicting = await tx.deviceCommand.findFirst({
				where: {
					impactEventId: incident.id,
					kind: CANCEL_ALERT_KIND,
					status: "PENDING",
					OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
				},
				select: { id: true },
			});
			if (conflicting) throw new CommandConflictError();

			const liveCommand = await tx.deviceCommand.findFirst({
				where: {
					impactEventId: incident.id,
					kind: ACK_INCIDENT_KIND,
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
					kind: ACK_INCIDENT_KIND,
					// The device compares this with its own g_incidentId (`llk-...`).
					payload: buildAckIncidentPayload(incident.clientIncidentId),
					createdAt: now,
					expiresAt: new Date(now.getTime() + ACK_INCIDENT_COMMAND_TTL_MS),
				},
			});
			await tx.auditLog.create({
				data: {
					orgId: current.org.id,
					actorId: current.user.id,
					action: "incident.ack_requested",
					target: incident.id,
					metadata: {
						from: incident.status,
						deviceId: incident.deviceId,
						clientIncidentId: incident.clientIncidentId,
					},
				},
			});
			return "created" as const;
		});
	} catch (error) {
		if (error instanceof CommandConflictError) redirect(commandConflictPath);
		throw error;
	}
	if (result === "blocked") redirect(transitionPath);

	revalidatePath(`/${locale}/dashboard`);
	revalidatePath(`/${locale}/incidents`);
	revalidatePath(`/${locale}/incidents/${incident.id}`);
	// The incident status has not changed yet, so the page must not claim it was
	// updated. The detail banner shows the pending tracker request.
	redirect(incidentAckRequestPath(locale, incident.id, returnTo));
}

export async function resolveIncidentAction(formData: FormData) {
	await transition(formData, "RESOLVED");
}

/**
 * ADMIN-only recovery for a tracker that cannot confirm.
 *
 * The normal resolve path requires ACKNOWLEDGED for a device-backed incident.
 * When the acknowledgement command expired or failed, or the tracker answered
 * `unknown_incident`/`unconfirmed` after a reboot or power loss, an admin may
 * close the incident anyway. This never claims the alarm stopped: the audit row
 * records the last command state and the copy warns that the alarm may keep
 * sounding until the device is powered off or acknowledges.
 */
export async function resolveWithoutTrackerAction(formData: FormData) {
	const locale = value(formData, "locale") === "tl" ? "tl" : "en";
	const incidentId = value(formData, "incidentId");
	const returnTo = value(formData, "returnTo");
	const fromDashboard = returnTo === "dashboard";
	const current = await requireUser();

	const forbiddenPath = fromDashboard
		? `/${locale}/dashboard?error=forbidden`
		: `/${locale}/incidents/${incidentId}?error=forbidden`;
	if (current.role !== "ADMIN") redirect(forbiddenPath);

	// The typed confirmation is enforced here, not only by the dialog. A direct
	// action call without the exact word is refused before any write.
	if (value(formData, "confirm") !== "RESOLVE") {
		redirect(
			fromDashboard
				? `/${locale}/dashboard?error=ack_confirmation_required`
				: `/${locale}/incidents/${incidentId}?error=ack_confirmation_required`,
		);
	}

	const incident = await prisma.impactEvent.findFirst({
		where: { id: incidentId, orgId: current.org.id },
		include: {
			vehicle: { select: { ownerId: true } },
			device: { select: { id: true } },
		},
	});
	if (!incident) {
		redirect(
			fromDashboard ? `/${locale}/dashboard?error=notfound` : `/${locale}/incidents?error=notfound`,
		);
	}

	const transitionPath = fromDashboard
		? `/${locale}/dashboard?error=transition`
		: `/${locale}/incidents/${incident.id}?error=transition`;
	const recoveryPath = fromDashboard
		? `/${locale}/dashboard?error=ack_recovery_unavailable`
		: `/${locale}/incidents/${incident.id}?error=ack_recovery_unavailable`;
	if (!incident.device || incident.status !== "CONFIRMED") redirect(recoveryPath);

	const commands = await prisma.deviceCommand.findMany({
		where: { impactEventId: incident.id, kind: ACK_INCIDENT_KIND },
		orderBy: { createdAt: "desc" },
		take: 20,
		select: {
			id: true,
			kind: true,
			status: true,
			payload: true,
			impactEventId: true,
			createdAt: true,
			expiresAt: true,
		},
	});
	const ack = readBureauAckState({
		incidentId: incident.id,
		status: incident.status,
		ackRequestedAt: incident.ackRequestedAt,
		commands,
	});
	if (
		!canResolveWithoutTracker({
			status: incident.status,
			deviceBacked: Boolean(incident.device),
			ack,
		})
	) {
		redirect(recoveryPath);
	}

	const lastCommand = latestAckIncidentCommand(incident.id, commands);
	const now = new Date();
	const resolution = boundResolution(value(formData, "resolution"), UNCONFIRMED_RESOLUTION);
	const resolved = await prisma.$transaction(async (tx) => {
		const updated = await tx.impactEvent.updateMany({
			where: {
				id: incident.id,
				orgId: current.org.id,
				status: "CONFIRMED",
				resolution: null,
			},
			data: {
				status: "RESOLVED",
				resolution,
				resolvedAt: now,
				ackRequestedAt: null,
			},
		});
		if (updated.count !== 1) return false;
		await tx.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "incident.resolved_unconfirmed",
				target: incident.id,
				metadata: {
					from: incident.status,
					to: "RESOLVED",
					source: "admin_recovery",
					ackState: ack.state,
					ackDetail: ack.detail,
					lastCommandId: lastCommand?.id ?? null,
					lastCommandStatus: lastCommand?.status ?? null,
					lastCommandDetail: lastCommand ? readAckIncidentDetail(lastCommand.payload) : null,
					lastCommandExpiresAt: lastCommand?.expiresAt?.toISOString() ?? null,
					resolution,
				},
			},
		});
		return true;
	});
	if (!resolved) redirect(transitionPath);

	revalidatePath(`/${locale}/dashboard`);
	revalidatePath(`/${locale}/incidents`);
	revalidatePath(`/${locale}/incidents/${incident.id}`);
	redirect(incidentSuccessPath(locale, incident.id, returnTo));
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
	const commandConflictPath = fromDashboard
		? `/${locale}/dashboard?error=command_conflict`
		: `/${locale}/incidents/${incident.id}?error=command_conflict`;
	if (!canRequestCancelAlert(incident.status as ImpactStatusName)) redirect(transitionPath);

	const now = new Date();
	let result: "blocked" | "duplicate" | "created";
	try {
		result = await prisma.$transaction(async (tx) => {
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

			// An acknowledgement is already waiting for the same tracker. Sending a
			// stand-down as well would put two contradictory commands in flight.
			const conflicting = await tx.deviceCommand.findFirst({
				where: {
					impactEventId: incident.id,
					kind: ACK_INCIDENT_KIND,
					status: "PENDING",
					OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
				},
				select: { id: true },
			});
			if (conflicting) throw new CommandConflictError();

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
	} catch (error) {
		if (error instanceof CommandConflictError) redirect(commandConflictPath);
		throw error;
	}
	if (result === "blocked") redirect(transitionPath);

	revalidatePath(`/${locale}/dashboard`);
	revalidatePath(`/${locale}/incidents`);
	revalidatePath(`/${locale}/incidents/${incident.id}`);
	redirect(incidentCancelRequestPath(locale, incident.id, returnTo));
}
