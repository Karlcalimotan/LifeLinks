import { ok } from "@/lib/api/envelope";
import { badRequest, conflict, forbidden, notFound, rateLimited } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import {
	CANCELLABLE_STATUSES,
	CANCEL_RATE_LIMIT,
	evaluateCancelAttempt,
} from "@/lib/device/cancel";
import { resolveDeviceTime } from "@/lib/device/time";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
	device_id: z.string().min(1).max(64),
	incident_id: z.string().min(1).max(64),
	cancelled_at: z.number().int().optional(),
});

type Device = Awaited<ReturnType<typeof requireDevice>>;

async function recordRejectedCancel(
	device: Device,
	incident: { id: string; clientIncidentId: string; status: string },
	reason: string,
	attemptedAt: Date,
	deviceCancelledAt: Date,
) {
	try {
		await prisma.auditLog.create({
			data: {
				orgId: device.orgId,
				action: "device.cancel_rejected",
				target: incident.id,
				metadata: {
					deviceId: device.id,
					clientIncidentId: incident.clientIncidentId,
					status: incident.status,
					reason,
					attemptedAt: attemptedAt.toISOString(),
					deviceCancelledAt: deviceCancelledAt.toISOString(),
				},
			},
		});
	} catch (error) {
		// The rejection is the safety decision. A failed audit write must not
		// turn it into a 500 that invites the device to retry the same request.
		console.error(
			`[device] could not record rejected cancel for incident ${incident.id}:`,
			error instanceof Error ? error.message : "unknown error",
		);
	}
}

/**
 * The driver pressed the cancel button inside the countdown. This is a real
 * event, not an absence of one: the dashboard shows a cancelled incident so a
 * false alarm is visible rather than silently disappearing.
 *
 * A cancel is accepted only while the incident is SUSPECTED or CONFIRMED and
 * the server-side deadline has not passed. `cancelled_at` is audit data, not
 * authority: a device with a wrong clock cannot extend its own window.
 */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const limit = rateLimit(
			`device:${device.id}:incident-cancel`,
			CANCEL_RATE_LIMIT.limit,
			CANCEL_RATE_LIMIT.windowMs,
		);
		if (!limit.allowed) {
			throw rateLimited(`Too many cancel reports. Retry in ${limit.retryAfterSeconds} seconds.`);
		}

		const parsed = cancelSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) throw badRequest("Invalid cancel payload.", parsed.error.flatten());
		const input = parsed.data;

		if (input.device_id !== device.mac && input.device_id !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}

		const incident = await prisma.impactEvent.findUnique({
			where: {
				deviceId_clientIncidentId: {
					deviceId: device.id,
					clientIncidentId: input.incident_id,
				},
			},
		});
		if (!incident) throw notFound("Incident not found for this device.");

		const attemptedAt = new Date();
		const cancelledAt = resolveDeviceTime(input.cancelled_at, attemptedAt);
		const decision = evaluateCancelAttempt(incident, attemptedAt);

		if (decision.action === "duplicate" || decision.action === "terminal") {
			return ok({ received: true, status: decision.status, changed: false });
		}

		if (decision.action !== "cancel") {
			await recordRejectedCancel(
				device,
				incident,
				decision.action === "window_closed" ? "cancel_window_closed" : "incident_not_cancellable",
				attemptedAt,
				cancelledAt,
			);

			if (decision.action === "window_closed") {
				throw conflict("Cancel window has closed.", {
					cancel_deadline: decision.deadline?.toISOString() ?? null,
					late_by_ms: decision.lateByMs,
				});
			}
			throw conflict("Incident can no longer be cancelled by the device.", {
				status: decision.status,
			});
		}

		let racedCancelled = false;
		await prisma.$transaction(async (tx) => {
			// Re-check the cancellable status in the update itself. An operator
			// acknowledging the incident between the read and this write must win.
			const updated = await tx.impactEvent.updateMany({
				where: { id: incident.id, status: { in: [...CANCELLABLE_STATUSES] } },
				data: {
					status: "CANCELLED",
					cancelledAt,
					resolution: "Cancelled by driver",
				},
			});
			if (updated.count === 0) {
				const current = await tx.impactEvent.findUnique({
					where: { id: incident.id },
					select: { status: true },
				});
				if (current?.status === "CANCELLED") {
					racedCancelled = true;
					return;
				}
				throw conflict("Incident can no longer be cancelled by the device.");
			}
			await tx.deviceStateEvent.create({
				data: {
					deviceId: device.id,
					type: "INCIDENT_CANCELLED",
					metadata: { incidentId: incident.id, cancelledAt: cancelledAt.toISOString() },
				},
			});
		});

		if (racedCancelled) {
			return ok({ received: true, status: "CANCELLED", changed: false, duplicate: true });
		}

		return ok({ received: true, status: "CANCELLED", changed: true });
	},
	{ route: "POST /api/device/incident/cancel" },
);
