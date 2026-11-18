import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { ingestSchema } from "@/lib/device/schema";
import { resolveDeviceTime } from "@/lib/device/time";
import { buildFirmwareConfig } from "@/lib/firmware/config";
import { isValidCoordinate } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { getOrgSettings, settingsToFirmwareValues } from "@/lib/settings/org";

export const dynamic = "force-dynamic";

/**
 * Device heartbeat + batched telemetry.
 *
 * The device authenticates with `x-device-token`. Every write is idempotent:
 * samples and events carry client-side ids, and the unique constraints make a
 * retry after a dropped response a no-op instead of a duplicate row.
 */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const parsed = ingestSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			throw badRequest("Invalid ingest payload.", parsed.error.flatten());
		}
		const input = parsed.data;

		if (input.device_id !== device.mac && input.device_id !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}

		const now = new Date();
		const heartbeat = input.heartbeat;
		const hasFix =
			heartbeat.lat != null &&
			heartbeat.lng != null &&
			isValidCoordinate(heartbeat.lat, heartbeat.lng);
		const fixAt = hasFix
			? new Date(now.getTime() - Math.max(0, heartbeat.gps_fix_age_s ?? 0) * 1000)
			: device.lastFixAt;

		await prisma.$transaction(async (tx) => {
			await tx.trackerDevice.update({
				where: { id: device.id },
				data: {
					lastSeenAt: now,
					firmwareVersion: input.firmware_version ?? device.firmwareVersion,
					batteryV: heartbeat.battery_v ?? device.batteryV,
					ignition: heartbeat.ignition ?? device.ignition,
					rssiDbm: heartbeat.rssi_dbm ?? device.rssiDbm,
					satellites: heartbeat.satellites ?? device.satellites,
					configRev: heartbeat.config_rev ?? device.configRev,
					lastLat: hasFix ? heartbeat.lat : device.lastLat,
					lastLng: hasFix ? heartbeat.lng : device.lastLng,
					lastFixAt: fixAt,
				},
			});

			if (input.samples.length > 0) {
				await tx.telemetrySample.createMany({
					data: input.samples.map((sample) => ({
						deviceId: device.id,
						clientSampleId: sample.id,
						recordedAt: resolveDeviceTime(sample.t, now),
						lat: sample.lat,
						lng: sample.lng,
						speedKph: sample.speed_kph,
						headingDeg: sample.heading_deg,
						accelG: sample.accel_g,
						tiltDeg: sample.tilt_deg,
						vibration: sample.vibration,
						satellites: sample.satellites,
						hdop: sample.hdop,
						batteryV: sample.battery_v,
						ignition: sample.ignition,
					})),
					skipDuplicates: true,
				});
			}

			if (input.events.length > 0) {
				await tx.deviceStateEvent.createMany({
					data: input.events.map((event) => ({
						deviceId: device.id,
						clientEventId: event.id,
						type: event.type,
						metadata: {
							...(event.meta ?? {}),
							clientEventId: event.id,
							deviceTime: event.t,
						},
						createdAt: resolveDeviceTime(event.t, now),
					})),
				});
			}
		});

		const settings = await getOrgSettings(device.orgId);
		const config = buildFirmwareConfig(settingsToFirmwareValues(settings));

		return ok({
			received: true,
			server_time: Math.floor(now.getTime() / 1000),
			config_rev: config.rev,
			heartbeat_interval_s: settings.heartbeatIntervalS,
		});
	},
	{ route: "POST /api/device/ingest" },
);

export const GET = withApi(async () => {
	throw notFound("Use POST for ingest.");
});
