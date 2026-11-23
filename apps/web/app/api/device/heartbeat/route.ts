import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden, notFound, rateLimited } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { heartbeatRequestSchema } from "@/lib/device/schema";
import { isValidCoordinate } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getDeviceConfig } from "@/lib/settings/device-config";

export const dynamic = "force-dynamic";

const HEARTBEATS_PER_MINUTE = 60;

/**
 * Heartbeat-only endpoint.
 *
 * `/api/device/ingest` remains the batched telemetry/event path. This route is
 * for a tracker that only needs to refresh its state, fetch the current config
 * revision and heartbeat interval. The device token identifies the tracker; the
 * optional `Idempotency-Key` header is recorded as the client event id so a
 * retry does not duplicate the HEARTBEAT event. The state update itself is
 * naturally idempotent.
 */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const limit = rateLimit(`device:${device.id}:heartbeat`, HEARTBEATS_PER_MINUTE, 60_000);
		if (!limit.allowed) {
			throw rateLimited(`Too many heartbeats. Retry in ${limit.retryAfterSeconds} seconds.`);
		}

		const parsed = heartbeatRequestSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			throw badRequest("Invalid heartbeat payload.", parsed.error.flatten());
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
		const idempotencyKey = request.headers.get("idempotency-key")?.trim().slice(0, 64) || null;
		let duplicate = false;

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

			if (idempotencyKey) {
				const existing = await tx.deviceStateEvent.findUnique({
					where: {
						deviceId_clientEventId: {
							deviceId: device.id,
							clientEventId: idempotencyKey,
						},
					},
				});
				duplicate = Boolean(existing);
				if (!existing) {
					await tx.deviceStateEvent.create({
						data: {
							deviceId: device.id,
							clientEventId: idempotencyKey,
							type: "HEARTBEAT",
							metadata: { source: "/api/device/heartbeat" },
						},
					});
				}
			}
		});

		const resolved = await getDeviceConfig(device.orgId, device.id);

		return ok({
			received: true,
			duplicate,
			server_time: Math.floor(now.getTime() / 1000),
			config_rev: resolved.config.rev,
			heartbeat_interval_s: resolved.values.heartbeatIntervalS,
		});
	},
	{ route: "POST /api/device/heartbeat" },
);

export const GET = withApi(async () => {
	throw notFound("Use POST for heartbeat.");
});
