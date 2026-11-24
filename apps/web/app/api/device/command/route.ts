import { alertPhonesForDevice } from "@/lib/alerts/templates";
import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden, rateLimited } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getDeviceConfig } from "@/lib/settings/device-config";

export const dynamic = "force-dynamic";

/**
 * The tracker's command poll. It carries two things:
 * - queued commands (locate, test alert, cancel, acknowledgement, config)
 * - the versioned firmware config object
 *
 * Commands are delivered until acknowledged or expired; the device dedupes by
 * command id in NVS. That keeps a dropped response from losing a command.
 */
export const GET = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const limit = rateLimit(`device:${device.id}:command`, 120, 60_000);
		if (!limit.allowed) {
			throw rateLimited(`Too many command polls. Retry in ${limit.retryAfterSeconds} seconds.`);
		}

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

		const resolved = await getDeviceConfig(device.orgId, device.id);
		// The owner's contacts for this tracker's vehicle are the people who
		// should get the tracker's own SMS. The organisation list stays as the
		// fallback when the vehicle has no active contacts.
		const contacts = device.vehicleId
			? await prisma.emergencyContact.findMany({
					where: { orgId: device.orgId, vehicleId: device.vehicleId, active: true },
					orderBy: { createdAt: "asc" },
					select: { phone: true, active: true },
				})
			: [];

		return ok({
			server_time: Math.floor(now.getTime() / 1000),
			alert_phones: alertPhonesForDevice(contacts, resolved.settings.alertPhones),
			commands: commands.map((command) => ({
				id: command.id,
				kind: command.kind,
				payload: command.payload,
				created_at: Math.floor(command.createdAt.getTime() / 1000),
			})),
			config: resolved.config,
		});
	},
	{ route: "GET /api/device/command" },
);
