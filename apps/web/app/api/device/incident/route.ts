import { type AlertTargets, alertTargetsForVehicle } from "@/lib/alerts/templates";
import { ok } from "@/lib/api/envelope";
import { badRequest, conflict, forbidden, rateLimited } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { type IncidentInput, incidentSchema } from "@/lib/device/schema";
import { resolveDeviceTime } from "@/lib/device/time";
import { isValidCoordinate } from "@/lib/geo";
import { readAckIncidentDetail } from "@/lib/incidents/bureau-ack";
import prisma from "@/lib/prisma";
import { notifyIncidentPush } from "@/lib/push/send";
import { rateLimit } from "@/lib/rate-limit";
import { getDeviceConfig } from "@/lib/settings/device-config";
import { getOrgSettings } from "@/lib/settings/org";
import { type ImpactStatus, Prisma } from "@prisma/client";
import { after } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Push is a confirmed-incident channel. The route schedules this after the
 * transaction has committed and after the response is on its way, so a slow
 * push service cannot delay the device and a failure cannot fail the write.
 */
function scheduleIncidentPush(input: {
	orgId: string;
	incidentId: string;
	vehicleId: string;
}): void {
	after(async () => {
		try {
			await notifyIncidentPush(input);
		} catch {
			console.warn("[push] notification dispatch failed after commit.");
		}
	});
}

interface ExistingIncident {
	id: string;
	status: ImpactStatus;
	lat: number | null;
	lng: number | null;
	gpsAgeS: number | null;
	evidence: Prisma.JsonValue | null;
}

/**
 * A tracker-confirmed acknowledgement is the only proof that the latched alarm
 * stopped. A legacy or local ACKNOWLEDGED has no such command, so the next
 * CONFIRMED report must reopen it.
 */
async function hasDeviceAcknowledgement(
	tx: Prisma.TransactionClient,
	incidentId: string,
): Promise<boolean> {
	const commands = await tx.deviceCommand.findMany({
		where: { impactEventId: incidentId, kind: "ACK_INCIDENT", status: "ACKED" },
		orderBy: { createdAt: "desc" },
		select: { payload: true },
	});
	return commands.some((command) => readAckIncidentDetail(command.payload) === "acknowledged");
}

/**
 * Move an existing incident to CONFIRMED and queue the first alerts once. The
 * conditional update keeps a concurrent terminal transition from being
 * overwritten. Used both for the normal SUSPECTED -> CONFIRMED transition and
 * for reopening a legacy ACKNOWLEDGED incident whose tracker is still latched.
 */
async function confirmExistingIncident({
	tx,
	incident,
	deviceId,
	input,
	hasFix,
	targets,
}: {
	tx: Prisma.TransactionClient;
	incident: ExistingIncident;
	deviceId: string;
	input: IncidentInput;
	hasFix: boolean;
	targets: AlertTargets;
}): Promise<{ transitioned: boolean; queued: number }> {
	const updated = await tx.impactEvent.updateMany({
		where: { id: incident.id, status: incident.status, resolution: null },
		data: {
			status: "CONFIRMED",
			ackRequestedAt: null,
			lat: hasFix ? input.lat : incident.lat,
			lng: hasFix ? input.lng : incident.lng,
			gpsAgeS: input.gps_age_s ?? incident.gpsAgeS,
			evidence: (input.evidence ?? incident.evidence ?? {}) as Prisma.InputJsonValue,
		},
	});
	if (updated.count === 0) return { transitioned: false, queued: 0 };

	let queued = 0;
	const existingAlerts = await tx.alertDelivery.count({
		where: { impactEventId: incident.id },
	});
	if (existingAlerts === 0) {
		const deliveries = [
			...targets.phones.map((target) => ({ channel: "SMS" as const, target })),
			...targets.emails.map((target) => ({ channel: "EMAIL" as const, target })),
		];
		if (deliveries.length > 0) {
			await tx.alertDelivery.createMany({
				data: deliveries.map((delivery) => ({
					impactEventId: incident.id,
					channel: delivery.channel,
					target: delivery.target,
					status: "QUEUED" as const,
				})),
			});
			queued = deliveries.length;
		}
	}
	await tx.deviceStateEvent.create({
		data: {
			deviceId,
			type: "INCIDENT_CONFIRMED",
			metadata: {
				incidentId: incident.id,
				clientIncidentId: input.incident_id,
				reopened: incident.status === "ACKNOWLEDGED",
			},
		},
	});
	return { transitioned: true, queued };
}

/**
 * Crash report endpoint. The device is the source of truth for detection; the
 * server records the incident, queues the configured alert targets and keeps
 * the evidence payload for the dashboard.
 *
 * Idempotency is keyed on `(deviceId, clientIncidentId)`: an SOS retry after a
 * flaky cellular link never creates a second incident or a second alert storm.
 */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const limit = rateLimit(`device:${device.id}:incident`, 30, 60_000);
		if (!limit.allowed) {
			throw rateLimited(`Too many incident reports. Retry in ${limit.retryAfterSeconds} seconds.`);
		}

		const parsed = incidentSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) throw badRequest("Invalid incident payload.", parsed.error.flatten());
		const input = parsed.data;

		if (input.device_id !== device.mac && input.device_id !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}
		if (!device.vehicleId) {
			throw conflict("Tracker is not assigned to a vehicle. Assign it before reporting incidents.");
		}
		// Kept as a local because the deferred push callback runs after this
		// scope's narrowing has ended.
		const vehicleId = device.vehicleId;

		// The vehicle's active contacts are merged ahead of the organisation
		// list once per request; both the new-incident path and the
		// SUSPECTED -> CONFIRMED transition use the same targets.
		const alertContacts = await prisma.emergencyContact.findMany({
			where: { orgId: device.orgId, vehicleId, active: true },
			orderBy: { createdAt: "asc" },
			select: { phone: true, email: true, active: true },
		});

		const detectedAt = resolveDeviceTime(input.detected_at);
		const hasFix =
			input.lat != null && input.lng != null && isValidCoordinate(input.lat, input.lng);
		const status =
			input.cancelled || input.status === "CANCELLED"
				? "CANCELLED"
				: input.status === "SUSPECTED"
					? "SUSPECTED"
					: "CONFIRMED";

		const existing = await prisma.impactEvent.findUnique({
			where: {
				deviceId_clientIncidentId: {
					deviceId: device.id,
					clientIncidentId: input.incident_id,
				},
			},
		});
		if (existing) {
			if (
				status === "CONFIRMED" &&
				(existing.status === "SUSPECTED" || existing.status === "ACKNOWLEDGED")
			) {
				const settingsForUpdate = await getOrgSettings(device.orgId);
				const targets = alertTargetsForVehicle(settingsForUpdate, alertContacts);
				let queued = 0;
				let transitioned = false;
				await prisma.$transaction(async (tx) => {
					if (existing.status === "ACKNOWLEDGED") {
						// A tracker-confirmed acknowledgement already stopped the alarm;
						// a repeated CONFIRMED report must not reopen it. A legacy or
						// local ACKNOWLEDGED has no device confirmation, so the live
						// alarm wins and the bureau must acknowledge it again.
						if (await hasDeviceAcknowledgement(tx, existing.id)) return;
					}
					const result = await confirmExistingIncident({
						tx,
						incident: existing,
						deviceId: device.id,
						input,
						hasFix,
						targets,
					});
					queued = result.queued;
					transitioned = result.transitioned;
				});
				if (transitioned) {
					// A suspected report sent nothing; this transition is the one
					// confirmed notification for the incident. A reopen is a new live
					// alarm, so it also gets one push.
					scheduleIncidentPush({
						orgId: device.orgId,
						incidentId: existing.id,
						vehicleId,
					});
				}
				return ok({
					received: true,
					incident_id: existing.id,
					// The SUSPECTED branch has always reported CONFIRMED even when a
					// concurrent request won the transition. A device-confirmed
					// ACKNOWLEDGED incident stays acknowledged.
					status:
						existing.status === "ACKNOWLEDGED" && !transitioned ? "ACKNOWLEDGED" : "CONFIRMED",
					duplicate: true,
					alerts_queued: queued,
				});
			}

			return ok({
				received: true,
				incident_id: existing.id,
				status: existing.status,
				duplicate: true,
				alerts_queued: 0,
			});
		}

		// The cancel deadline is the server-side authority for a driver cancel.
		// It must use the same per-device effective window the tracker runs, or
		// an override of 60 s would be rejected against the org default of 5 s.
		const resolved = await getDeviceConfig(device.orgId, device.id);
		const activeTrip = await prisma.trip.findFirst({
			where: { deviceId: device.id, status: "ACTIVE" },
			orderBy: { startedAt: "desc" },
		});

		let deliveries: Array<{ channel: "SMS" | "EMAIL"; target: string }> = [];

		try {
			const incident = await prisma.$transaction(async (tx) => {
				const created = await tx.impactEvent.create({
					data: {
						orgId: device.orgId,
						deviceId: device.id,
						vehicleId,
						tripId: activeTrip?.id,
						clientIncidentId: input.incident_id,
						detectedAt,
						peakAccelG: input.peak_accel_g,
						tiltDeg: input.tilt_deg,
						vibrationCount: input.vibration_count,
						speedKph: input.speed_kph,
						lat: hasFix ? input.lat : device.lastLat,
						lng: hasFix ? input.lng : device.lastLng,
						gpsAgeS: input.gps_age_s,
						status,
						cancelDeadline: new Date(detectedAt.getTime() + resolved.values.cancelWindowS * 1000),
						cancelledAt: status === "CANCELLED" ? new Date() : null,
						resolution: status === "CANCELLED" ? "Cancelled by driver" : null,
						evidence: (input.evidence ?? {}) as Prisma.InputJsonValue,
					},
				});

				if (status !== "CANCELLED") {
					const targets = alertTargetsForVehicle(resolved.settings, alertContacts);
					deliveries = [
						...targets.phones.map((target) => ({
							channel: "SMS" as const,
							target,
						})),
						...targets.emails.map((target) => ({
							channel: "EMAIL" as const,
							target,
						})),
					];
					if (deliveries.length > 0) {
						await tx.alertDelivery.createMany({
							data: deliveries.map((delivery) => ({
								impactEventId: created.id,
								channel: delivery.channel,
								target: delivery.target,
								status: "QUEUED" as const,
							})),
						});
					}
				}

				await tx.deviceStateEvent.create({
					data: {
						deviceId: device.id,
						type: status === "CANCELLED" ? "INCIDENT_CANCELLED" : "INCIDENT_CONFIRMED",
						metadata: {
							incidentId: created.id,
							clientIncidentId: input.incident_id,
							peakAccelG: input.peak_accel_g,
							tiltDeg: input.tilt_deg,
						},
					},
				});

				return { created, deliveries };
			});

			// Confirmed incidents only. The initial SUSPECTED report stays quiet;
			// if the tracker later confirms, that transition schedules one push.
			if (status === "CONFIRMED") {
				scheduleIncidentPush({
					orgId: device.orgId,
					incidentId: incident.created.id,
					vehicleId,
				});
			}

			return ok({
				received: true,
				incident_id: incident.created.id,
				status: incident.created.status,
				duplicate: false,
				alerts_queued: incident.deliveries.length,
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
				const raced = await prisma.impactEvent.findUnique({
					where: {
						deviceId_clientIncidentId: {
							deviceId: device.id,
							clientIncidentId: input.incident_id,
						},
					},
				});
				if (raced) {
					return ok({
						received: true,
						incident_id: raced.id,
						status: raced.status,
						duplicate: true,
						alerts_queued: 0,
					});
				}
			}
			throw error;
		}
	},
	{ route: "POST /api/device/incident" },
);
