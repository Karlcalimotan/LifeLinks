import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { commandAckSchema } from "@/lib/device/schema";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** A device confirms a command it actually executed (or reports a failure). */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const parsed = commandAckSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success)
			throw badRequest("Invalid command acknowledgement.", parsed.error.flatten());
		const input = parsed.data;

		if (input.device_id !== device.mac && input.device_id !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}

		const command = await prisma.deviceCommand.findFirst({
			where: { id: input.command_id, deviceId: device.id },
		});
		if (!command) throw notFound("Command not found for this device.");

		const updated = await prisma.deviceCommand.update({
			where: { id: command.id },
			data: {
				status: input.status,
				ackedAt: new Date(),
				payload: {
					...(typeof command.payload === "object" && command.payload !== null
						? (command.payload as Record<string, unknown>)
						: {}),
					ackDetail: input.detail ?? null,
				},
			},
		});

		return ok({ received: true, command_id: updated.id, status: updated.status });
	},
	{ route: "POST /api/device/command/ack", timeoutMs: 10_000 },
);
