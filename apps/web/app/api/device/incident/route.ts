import { alertTargetsFromSettings } from "@/lib/alerts/templates";
import { ok } from "@/lib/api/envelope";
import { badRequest, conflict, forbidden, rateLimited } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { incidentSchema } from "@/lib/device/schema";
import { resolveDeviceTime } from "@/lib/device/time";
import { isValidCoordinate } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { notifyIncidentPush } from "@/lib/push/send";
import { rateLimit } from "@/lib/rate-limit";
import { getOrgSettings } from "@/lib/settings/org";
import { Prisma } from "@prisma/client";
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
			if (existing.status === "SUSPECTED" && status === "CONFIRMED") {
				const settingsForUpdate = await getOrgSettings(device.orgId);
				const targets = alertTargetsFromSettings(settingsForUpdate);
				let queued = 0;
				let transitioned = false;
				await prisma.$transaction(async (tx) => {
					// Only the request that actually flips SUSPECTED to CONFIRMED
					// queues alerts, records the event and sends the one push.
					const updated = await tx.impactEvent.updateMany({
						where: { id: existing.id, status: "SUSPECTED" },
						data: {
							status: "CONFIRMED",
							lat: hasFix ? input.lat : existing.lat,
							lng: hasFix ? input.lng : existing.lng,
							gpsAgeS: input.gps_age_s ?? existing.gpsAgeS,
							evidence: (input.evidence ?? existing.evidence ?? {}) as Prisma.InputJsonValue,
						},
					});
					if (updated.count === 0) return;
					transitioned = true;
					const existingAlerts = await tx.alertDelivery.count({
						where: { impactEventId: existing.id },
					});
					if (existingAlerts === 0) {
						const deliveries = [
							...targets.phones.map((target) => ({ channel: "SMS" as const, target })),
							...targets.emails.map((target) => ({ channel: "EMAIL" as const, target })),
						];
						if (deliveries.length > 0) {
							await tx.alertDelivery.createMany({
								data: deliveries.map((delivery) => ({
									impactEventId: existing.id,
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
							deviceId: device.id,
							type: "INCIDENT_CONFIRMED",
							metadata: { incidentId: existing.id, clientIncidentId: input.incident_id },
						},
					});
				});
				if (transitioned) {
					// A suspected report sent nothing; this transition is the one
					// confirmed notification for the incident.
					scheduleIncidentPush({
						orgId: device.orgId,
						incidentId: existing.id,
						vehicleId,
					});
				}
				return ok({
					received: true,
					incident_id: existing.id,
					status: "CONFIRMED",
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

		const settings = await getOrgSettings(device.orgId);
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
						cancelDeadline: new Date(detectedAt.getTime() + settings.cancelWindowS * 1000),
						cancelledAt: status === "CANCELLED" ? new Date() : null,
						resolution: status === "CANCELLED" ? "Cancelled by driver" : null,
						evidence: (input.evidence ?? {}) as Prisma.InputJsonValue,
					},
				});

				if (status !== "CANCELLED") {
					const targets = alertTargetsFromSettings(settings);
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
