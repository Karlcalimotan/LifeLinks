import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { buildFirmwareConfig } from "@/lib/firmware/config";
import prisma from "@/lib/prisma";
import { getOrgSettings, settingsToFirmwareValues } from "@/lib/settings/org";

export const dynamic = "force-dynamic";

/**
 * The tracker's command poll. It carries two things:
 * - queued commands (locate, arm/disarm, test alert, config)
 * - the versioned firmware config object
 *
 * Commands are delivered until acknowledged or expired; the device dedupes by
 * command id in NVS. That keeps a dropped response from losing a command.
 */
export const GET = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const url = new URL(request.url);
		const requested = url.searchParams.get("device_id");
		if (!requested) throw badRequest("device_id is required.");
		if (requested !== device.mac && requested !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}

		const now = new Date();
		await prisma.$transaction([
			prisma.trackerDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } }),
			prisma.deviceCommand.updateMany({
				where: {
					deviceId: device.id,
					status: "PENDING",
					expiresAt: { lt: now },
				},
				data: { status: "EXPIRED" },
			}),
		]);

		const commands = await prisma.deviceCommand.findMany({
			where: { deviceId: device.id, status: "PENDING" },
			orderBy: { createdAt: "asc" },
			take: 10,
		});

		const settings = await getOrgSettings(device.orgId);
		const config = buildFirmwareConfig(settingsToFirmwareValues(settings));

		return ok({
			server_time: Math.floor(now.getTime() / 1000),
			alert_phones: settings.alertPhones,
			commands: commands.map((command) => ({
				id: command.id,
				kind: command.kind,
				payload: command.payload,
				created_at: Math.floor(command.createdAt.getTime() / 1000),
			})),
			config,
		});
	},
	{ route: "GET /api/device/command", timeoutMs: 10_000 },
);
