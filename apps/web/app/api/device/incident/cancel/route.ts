import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { resolveDeviceTime } from "@/lib/device/time";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
	device_id: z.string().min(1).max(64),
	incident_id: z.string().min(1).max(64),
	cancelled_at: z.number().int().optional(),
});

/**
 * The driver pressed the cancel button inside the countdown. This is a real
 * event, not an absence of one: the dashboard shows a cancelled incident so a
 * false alarm is visible rather than silently disappearing.
 */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

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
		if (incident.status === "RESOLVED" || incident.status === "FALSE_ALARM") {
			return ok({ received: true, status: incident.status, changed: false });
		}
		if (incident.status === "CANCELLED") {
			return ok({ received: true, status: incident.status, changed: false });
		}

		const cancelledAt = resolveDeviceTime(input.cancelled_at);
		const updated = await prisma.$transaction(async (tx) => {
			const row = await tx.impactEvent.update({
				where: { id: incident.id },
				data: {
					status: "CANCELLED",
					cancelledAt,
					resolution: "Cancelled by driver",
				},
			});
			await tx.deviceStateEvent.create({
				data: {
					deviceId: device.id,
					type: "INCIDENT_CANCELLED",
					metadata: { incidentId: row.id, cancelledAt: cancelledAt.toISOString() },
				},
			});
			return row;
		});

		return ok({ received: true, status: updated.status, changed: true });
	},
	{ route: "POST /api/device/incident/cancel" },
);
