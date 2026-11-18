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

		let eventsCreated = 0;
		for (const device of stale) {
			const recent = await prisma.deviceStateEvent.findFirst({
				where: {
					deviceId: device.id,
					type: "DEVICE_OFFLINE",
					createdAt: { gte: new Date(now.getTime() - ONE_HOUR_MS) },
				},
				select: { id: true },
			});
			if (recent) continue;
			await prisma.deviceStateEvent.create({
				data: {
					deviceId: device.id,
					type: "DEVICE_OFFLINE",
					metadata: {
						lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
						offlineAfterMin: DEVICE_OFFLINE_AFTER_MIN,
					},
				},
			});
			eventsCreated += 1;
		}

		return ok({ checked: stale.length, offline: stale.length, events_created: eventsCreated });
	},
	{ route: "GET /api/cron/device-watch", timeoutMs: 60_000 },
);
