import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden, notFound, rateLimited } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { commandAckSchema } from "@/lib/device/schema";
import {
	ACK_INCIDENT_CONFIRMABLE_STATUSES,
	type AckIncidentOutcome,
	canConfirmAckIncident,
	classifyAckIncident,
} from "@/lib/incidents/bureau-ack";
import {
	CANCEL_ALERT_CLOSABLE_STATUSES,
	CANCEL_ALERT_RESOLUTION,
	type CancelAckOutcome,
	canCloseCancelAlert,
	classifyCancelAck,
} from "@/lib/incidents/cancel-alert";
import type { ImpactStatusName } from "@/lib/incidents/state";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function mergeAckPayload(payload: unknown, detail: string | null) {
	return {
		...(typeof payload === "object" && payload !== null
			? (payload as Record<string, unknown>)
			: {}),
		ackDetail: detail,
	};
}

type CancelAlertAckResult = CancelAckOutcome | "already_closed";
type AckIncidentAckResult = AckIncidentOutcome | "already_closed";

/**
 * A device confirms a command it actually executed (or reports a failure).
 *
 * CANCEL_ALERT is the one command that changes an incident, and only an explicit
 * `cancelled` detail closes it as FALSE_ALARM. `too_late`, `unknown_incident`,
 * a missing detail or a failed command keep the status and leave a durable
 * reason, so the dashboard never implies the tracker stopped when it did not.
 *
 * The incident comes from `command.impactEventId`, not from the device payload:
 * the payload carries the tracker's own client incident id (`llk-...`).
 */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const limit = rateLimit(`device:${device.id}:command-ack`, 60, 60_000);
		if (!limit.allowed) {
			throw rateLimited(
				`Too many command acknowledgements. Retry in ${limit.retryAfterSeconds} seconds.`,
			);
		}

		const parsed = commandAckSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success)
			throw badRequest("Invalid command acknowledgement.", parsed.error.flatten());
		const input = parsed.data;

		if (input.device_id !== device.mac && input.device_id !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}

		const command = await prisma.deviceCommand.findFirst({
			where: { id: input.command_id, deviceId: device.id },
		});
		if (!command) throw notFound("Command not found for this device.");

		// The firmware sends the ACK state in `detail`; `result` is accepted for
		// the contract wording and for any device that names the field that way.
		const detail = input.detail ?? input.result ?? null;
		const now = new Date();

		if (command.kind === "CANCEL_ALERT") {
			const result = await prisma.$transaction(async (tx) => {
				// Idempotency: the acknowledgement applies once. A retry answers with
				// the command's current state and never touches the incident again.
				// An EXPIRED command may still be confirmed: the device can report what
				// it executed after a slow poll, and that report is real.
				const marked = await tx.deviceCommand.updateMany({
					where: {
						id: command.id,
						deviceId: device.id,
						status: { in: ["PENDING", "EXPIRED"] },
					},
					data: {
						status: input.status,
						ackedAt: now,
						payload: mergeAckPayload(command.payload, detail),
					},
				});
				if (marked.count === 0) {
					const current = await tx.deviceCommand.findUnique({
						where: { id: command.id },
						select: { status: true },
					});
					return {
						applied: false,
						status: current?.status ?? command.status,
						result: null,
						incidentStatus: null,
					};
				}

				const incidentId = command.impactEventId;
				if (!incidentId) {
					// Every CANCEL_ALERT this build creates carries the server incident.
					// A command without it cannot be matched safely to an incident.
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.cancel_unconfirmed",
							target: null,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: "unconfirmed",
								reason: "missing_impact_link",
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: "unconfirmed" as const,
						incidentStatus: null,
					};
				}

				// The incident must belong to the authenticated device and its org.
				const incident = await tx.impactEvent.findFirst({
					where: { id: incidentId, orgId: device.orgId, deviceId: device.id },
					select: { id: true, status: true, resolution: true },
				});
				const outcome = classifyCancelAck({ status: input.status, detail });

				if (!incident) {
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.cancel_unconfirmed",
							target: incidentId,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: "unknown_incident",
								reason: "incident_not_found_for_device",
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: "unknown_incident" as const,
						incidentStatus: null,
					};
				}

				if (outcome !== "cancelled") {
					// The tracker answered; there is no longer a live request. Keep the
					// status and the resolution exactly as they were.
					await tx.impactEvent.updateMany({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						data: { cancelRequestedAt: null },
					});
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.cancel_unconfirmed",
							target: incident.id,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: outcome,
								from: incident.status,
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: outcome,
						incidentStatus: incident.status,
					};
				}

				// A driver-cancelled incident or one that already has a resolution is
				// not rewritten by a late tracker confirmation.
				const notClosable =
					!canCloseCancelAlert(incident.status as ImpactStatusName) || incident.resolution !== null;
				if (notClosable) {
					await tx.impactEvent.updateMany({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						data: { cancelRequestedAt: null },
					});
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.cancel_ack_ignored",
							target: incident.id,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: "already_closed",
								reason: incident.resolution !== null ? "resolution_recorded" : "status",
								from: incident.status,
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: "already_closed" as const,
						incidentStatus: incident.status,
					};
				}

				const closed = await tx.impactEvent.updateMany({
					where: {
						id: incident.id,
						orgId: device.orgId,
						deviceId: device.id,
						resolution: null,
						status: { in: [...CANCEL_ALERT_CLOSABLE_STATUSES] },
					},
					data: {
						status: "FALSE_ALARM",
						resolvedAt: now,
						resolution: CANCEL_ALERT_RESOLUTION,
						cancelRequestedAt: null,
					},
				});
				if (closed.count === 0) {
					const current = await tx.impactEvent.findFirst({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						select: { status: true },
					});
					await tx.impactEvent.updateMany({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						data: { cancelRequestedAt: null },
					});
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.cancel_ack_ignored",
							target: incident.id,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: current ? "already_closed" : "unknown_incident",
								from: current?.status ?? incident.status,
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: current ? ("already_closed" as const) : ("unknown_incident" as const),
						incidentStatus: current?.status ?? null,
					};
				}

				await tx.auditLog.create({
					data: {
						orgId: device.orgId,
						action: "incident.false_alarm",
						target: incident.id,
						metadata: {
							from: incident.status,
							to: "FALSE_ALARM",
							source: "device_ack",
							commandId: command.id,
							detail: "cancelled",
						},
					},
				});
				return {
					applied: true,
					status: input.status,
					result: "cancelled" as CancelAlertAckResult,
					incidentStatus: "FALSE_ALARM",
				};
			});

			return ok({
				received: true,
				command_id: command.id,
				status: result.status,
				result: result.result,
				incident_status: result.incidentStatus,
				duplicate: !result.applied,
				changed: result.result === "cancelled",
			});
		}

		if (command.kind === "ACK_INCIDENT") {
			const result = await prisma.$transaction(async (tx) => {
				// Idempotency matches CANCEL_ALERT: the acknowledgement applies once,
				// and a retry answers with the command's current state.
				const marked = await tx.deviceCommand.updateMany({
					where: {
						id: command.id,
						deviceId: device.id,
						status: { in: ["PENDING", "EXPIRED"] },
					},
					data: {
						status: input.status,
						ackedAt: now,
						payload: mergeAckPayload(command.payload, detail),
					},
				});
				if (marked.count === 0) {
					const current = await tx.deviceCommand.findUnique({
						where: { id: command.id },
						select: { status: true },
					});
					return {
						applied: false,
						status: current?.status ?? command.status,
						result: null,
						incidentStatus: null,
						changed: false,
					};
				}

				const incidentId = command.impactEventId;
				if (!incidentId) {
					// Every ACK_INCIDENT this build creates carries the server incident.
					// A command without it cannot be matched safely to an incident.
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.ack_unconfirmed",
							target: null,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: "unconfirmed",
								reason: "missing_impact_link",
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: "unconfirmed" as const,
						incidentStatus: null,
						changed: false,
					};
				}

				// The incident comes from the command row, never from the device
				// payload. It must belong to the authenticated device and its org.
				const incident = await tx.impactEvent.findFirst({
					where: { id: incidentId, orgId: device.orgId, deviceId: device.id },
					select: { id: true, status: true },
				});
				const outcome = classifyAckIncident({ status: input.status, detail });

				if (!incident) {
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.ack_unconfirmed",
							target: incidentId,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: "unknown_incident",
								reason: "incident_not_found_for_device",
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: "unknown_incident" as const,
						incidentStatus: null,
						changed: false,
					};
				}

				if (outcome !== "acknowledged") {
					// The tracker answered but did not confirm that the alarm stopped.
					// Keep the pre-ack status, clear the pending request so a retry is
					// possible, and leave the reason on the command and the audit trail.
					await tx.impactEvent.updateMany({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						data: { ackRequestedAt: null },
					});
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.ack_unconfirmed",
							target: incident.id,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: outcome,
								from: incident.status,
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: outcome,
						incidentStatus: incident.status,
						changed: false,
					};
				}

				// A concurrent resolve or false alarm wins. A late acknowledgement
				// never resurrects a closed incident.
				if (!canConfirmAckIncident(incident.status as ImpactStatusName)) {
					await tx.impactEvent.updateMany({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						data: { ackRequestedAt: null },
					});
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.ack_ignored",
							target: incident.id,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: "already_closed",
								reason: "status",
								from: incident.status,
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: "already_closed" as const,
						incidentStatus: incident.status,
						changed: false,
					};
				}

				const confirmed = await tx.impactEvent.updateMany({
					where: {
						id: incident.id,
						orgId: device.orgId,
						deviceId: device.id,
						resolution: null,
						status: { in: [...ACK_INCIDENT_CONFIRMABLE_STATUSES] },
					},
					data: { status: "ACKNOWLEDGED", ackRequestedAt: null },
				});
				if (confirmed.count === 0) {
					const current = await tx.impactEvent.findFirst({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						select: { status: true },
					});
					await tx.impactEvent.updateMany({
						where: { id: incident.id, orgId: device.orgId, deviceId: device.id },
						data: { ackRequestedAt: null },
					});
					await tx.auditLog.create({
						data: {
							orgId: device.orgId,
							action: "incident.ack_ignored",
							target: incident.id,
							metadata: {
								commandId: command.id,
								deviceId: device.id,
								result: current ? "already_closed" : "unknown_incident",
								from: current?.status ?? incident.status,
							},
						},
					});
					return {
						applied: true,
						status: input.status,
						result: current ? ("already_closed" as const) : ("unknown_incident" as const),
						incidentStatus: current?.status ?? null,
						changed: false,
					};
				}

				await tx.auditLog.create({
					data: {
						orgId: device.orgId,
						action: "incident.acknowledged",
						target: incident.id,
						metadata: {
							from: incident.status,
							to: "ACKNOWLEDGED",
							source: "device",
							commandId: command.id,
							detail: "acknowledged",
						},
					},
				});
				return {
					applied: true,
					status: input.status,
					result: "acknowledged" as AckIncidentAckResult,
					incidentStatus: "ACKNOWLEDGED",
					changed: incident.status !== "ACKNOWLEDGED",
				};
			});

			return ok({
				received: true,
				command_id: command.id,
				status: result.status,
				result: result.result,
				incident_status: result.incidentStatus,
				duplicate: !result.applied,
				changed: result.changed,
			});
		}

		const updated = await prisma.deviceCommand.update({
			where: { id: command.id },
			data: {
				status: input.status,
				ackedAt: now,
				payload: mergeAckPayload(command.payload, detail),
			},
		});

		return ok({ received: true, command_id: updated.id, status: updated.status });
	},
	{ route: "POST /api/device/command/ack" },
);
