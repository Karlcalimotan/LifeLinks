import { ok } from "@/lib/api/envelope";
import { ApiError, unauthorized } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { DEVICE_OFFLINE_AFTER_MIN } from "@/lib/constants";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Periodic device watch. A tracker that has been silent past the offline
 * window gets one `DEVICE_OFFLINE` event per hour, not one per cron tick. The
 * event log stays readable and the dashboard can show when the unit went dark.
 */
export const GET = withApi(
	async (request) => {
		const secret = process.env.CRON_SECRET?.trim();
		if (!secret) throw new ApiError(503, "INTERNAL", "CRON_SECRET is not configured.");
		const authorization = request.headers.get("authorization") ?? "";
		if (authorization !== `Bearer ${secret}`) throw unauthorized("Invalid cron secret.");

		const now = new Date();
		const cutoff = new Date(now.getTime() - DEVICE_OFFLINE_AFTER_MIN * 60 * 1000);

		const stale = await prisma.trackerDevice.findMany({
			where: {
				approvalStatus: "APPROVED",
				OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
			},
			select: { id: true, lastSeenAt: true },
			take: 500,
		});

		if (stale.length === 0) {
			return ok({ checked: 0, offline: 0, events_created: 0 });
		}

		// One read and one batched insert instead of two queries per device.
		const recentEvents = await prisma.deviceStateEvent.findMany({
			where: {
				deviceId: { in: stale.map((device) => device.id) },
				type: "DEVICE_OFFLINE",
				createdAt: { gte: new Date(now.getTime() - ONE_HOUR_MS) },
			},
			select: { deviceId: true },
		});
		const recentIds = new Set(recentEvents.map((event) => event.deviceId));
		const toCreate = stale.filter((device) => !recentIds.has(device.id));

		if (toCreate.length > 0) {
			await prisma.deviceStateEvent.createMany({
				data: toCreate.map((device) => ({
					deviceId: device.id,
					type: "DEVICE_OFFLINE",
					metadata: {
						lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
						offlineAfterMin: DEVICE_OFFLINE_AFTER_MIN,
					},
				})),
			});
		}

		return ok({
			checked: stale.length,
			offline: stale.length,
			events_created: toCreate.length,
		});
	},
	// Background watch job, not a hot API path; the 2 s hot-path budget does not apply.
	{ route: "GET /api/cron/device-watch", timeoutMs: 60_000 },
);
