"use server";

import { canAdminister, requireUser } from "@/lib/auth/session";
import { generateDeviceToken, hashDeviceToken } from "@/lib/device/auth";
import {
	commandSchema,
	createDeviceSchema,
	deleteDeviceSchema,
	normalizeMac,
	updateDeviceSchema,
} from "@/lib/device/validation";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface DeviceTokenState {
	ok: boolean;
	error?: string;
	token?: string;
	mac?: string;
}

export interface DeviceEditState {
	ok: boolean;
	error?: string;
}

function localeFrom(formData: FormData): string {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

export async function createDeviceAction(
	_previous: DeviceTokenState,
	formData: FormData,
): Promise<DeviceTokenState> {
	const current = await requireUser();
	if (!canAdminister(current.role)) {
		return { ok: false, error: "Only admins can register trackers." };
	}

	const parsed = createDeviceSchema.safeParse({
		mac: String(formData.get("mac") ?? ""),
		label: String(formData.get("label") ?? ""),
		vehicleId: String(formData.get("vehicleId") ?? ""),
	});
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid tracker details." };
	}

	const mac = normalizeMac(parsed.data.mac);
	const existing = await prisma.trackerDevice.findUnique({ where: { mac } });
	if (existing) return { ok: false, error: "A tracker with that MAC already exists." };

	const vehicleId = parsed.data.vehicleId || null;
	if (vehicleId) {
		const vehicle = await prisma.vehicle.findFirst({
			where: { id: vehicleId, orgId: current.org.id },
		});
		if (!vehicle) return { ok: false, error: "That vehicle is not in your organization." };
	}

	const token = generateDeviceToken();
	const device = await prisma.trackerDevice.create({
		data: {
			orgId: current.org.id,
			vehicleId,
			mac,
			label: parsed.data.label,
			tokenHash: hashDeviceToken(token),
			approvalStatus: "APPROVED",
		},
	});

	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "device.created",
			target: device.id,
			metadata: { mac, vehicleId },
		},
	});

	revalidatePath(`/${localeFrom(formData)}/devices`);
	return { ok: true, token, mac };
}

export async function rotateDeviceTokenAction(
	_previous: DeviceTokenState,
	formData: FormData,
): Promise<DeviceTokenState> {
	const current = await requireUser();
	if (!canAdminister(current.role)) {
		return { ok: false, error: "Only admins can rotate device tokens." };
	}

	const deviceId = String(formData.get("deviceId") ?? "");
	const device = await prisma.trackerDevice.findFirst({
		where: { id: deviceId, orgId: current.org.id },
	});
	if (!device) return { ok: false, error: "Tracker not found." };

	const token = generateDeviceToken();
	await prisma.trackerDevice.update({
		where: { id: device.id },
		data: { tokenHash: hashDeviceToken(token) },
	});
	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "device.token_rotated",
			target: device.id,
			metadata: { mac: device.mac },
		},
	});

	revalidatePath(`/${localeFrom(formData)}/devices/${device.id}`);
	revalidatePath(`/${localeFrom(formData)}/devices`);
	return { ok: true, token, mac: device.mac };
}

export async function commandDeviceAction(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role)) redirect(`/${locale}/devices?error=forbidden`);

	const deviceId = String(formData.get("deviceId") ?? "");
	const kind = commandSchema.safeParse(String(formData.get("kind") ?? ""));
	if (!kind.success) redirect(`/${locale}/devices/${deviceId}?error=bad_command`);

	const device = await prisma.trackerDevice.findFirst({
		where: { id: deviceId, orgId: current.org.id },
	});
	if (!device) redirect(`/${locale}/devices?error=notfound`);

	await prisma.deviceCommand.create({
		data: {
			deviceId: device.id,
			kind: kind.data,
			payload: {},
			expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		},
	});
	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "device.command_queued",
			target: device.id,
			metadata: { kind: kind.data },
		},
	});

	revalidatePath(`/${locale}/devices/${device.id}`);
	redirect(`/${locale}/devices/${device.id}?command=queued`);
}

export async function approveDeviceAction(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role)) redirect(`/${locale}/devices?error=forbidden`);

	const deviceId = String(formData.get("deviceId") ?? "");
	const device = await prisma.trackerDevice.findFirst({
		where: { id: deviceId, orgId: current.org.id },
	});
	if (!device) redirect(`/${locale}/devices?error=notfound`);

	await prisma.$transaction([
		prisma.trackerDevice.update({
			where: { id: device.id },
			data: { approvalStatus: "APPROVED" },
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "device.approved",
				target: device.id,
				metadata: { mac: device.mac, previousStatus: device.approvalStatus },
			},
		}),
	]);
	revalidatePath(`/${locale}/devices/${device.id}`);
	revalidatePath(`/${locale}/devices`);
	redirect(`/${locale}/devices/${device.id}?approved=1`);
}

export async function rejectDeviceAction(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role)) redirect(`/${locale}/devices?error=forbidden`);

	const deviceId = String(formData.get("deviceId") ?? "");
	const device = await prisma.trackerDevice.findFirst({
		where: { id: deviceId, orgId: current.org.id },
	});
	if (!device) redirect(`/${locale}/devices?error=notfound`);

	await prisma.$transaction([
		prisma.trackerDevice.update({
			where: { id: device.id },
			data: { approvalStatus: "REJECTED" },
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "device.rejected",
				target: device.id,
				metadata: { mac: device.mac, previousStatus: device.approvalStatus },
			},
		}),
	]);
	revalidatePath(`/${locale}/devices/${device.id}`);
	revalidatePath(`/${locale}/devices`);
	redirect(`/${locale}/devices/${device.id}?rejected=1`);
}

export async function updateDeviceAction(
	_previous: DeviceEditState,
	formData: FormData,
): Promise<DeviceEditState> {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role)) {
		return { ok: false, error: "Only admins can edit trackers." };
	}

	const parsed = updateDeviceSchema.safeParse({
		deviceId: String(formData.get("deviceId") ?? ""),
		label: String(formData.get("label") ?? ""),
		vehicleId: String(formData.get("vehicleId") ?? ""),
	});
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid tracker details." };
	}

	const device = await prisma.trackerDevice.findFirst({
		where: { id: parsed.data.deviceId, orgId: current.org.id },
	});
	if (!device) return { ok: false, error: "Tracker not found." };

	const vehicleId = parsed.data.vehicleId || null;
	if (vehicleId) {
		const vehicle = await prisma.vehicle.findFirst({
			where: { id: vehicleId, orgId: current.org.id },
		});
		if (!vehicle) return { ok: false, error: "That vehicle is not in your organization." };
	}

	await prisma.$transaction([
		prisma.trackerDevice.update({
			where: { id: device.id },
			data: { label: parsed.data.label, vehicleId },
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "device.updated",
				target: device.id,
				metadata: {
					mac: device.mac,
					before: { label: device.label, vehicleId: device.vehicleId },
					after: { label: parsed.data.label, vehicleId },
				},
			},
		}),
	]);

	revalidatePath(`/${locale}/devices`);
	revalidatePath(`/${locale}/devices/${device.id}`);
	return { ok: true };
}

export async function deleteDeviceAction(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role)) redirect(`/${locale}/devices?error=forbidden`);

	const parsed = deleteDeviceSchema.safeParse({
		deviceId: String(formData.get("deviceId") ?? ""),
	});
	if (!parsed.success) redirect(`/${locale}/devices?error=invalid`);

	const device = await prisma.trackerDevice.findFirst({
		where: { id: parsed.data.deviceId, orgId: current.org.id },
	});
	if (!device) redirect(`/${locale}/devices?error=notfound`);

	await prisma.$transaction([
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "device.deleted",
				target: device.id,
				metadata: {
					mac: device.mac,
					label: device.label,
					vehicleId: device.vehicleId,
				},
			},
		}),
		prisma.trackerDevice.delete({ where: { id: device.id } }),
	]);

	revalidatePath(`/${locale}/devices`);
	redirect(`/${locale}/devices?deleted=1`);
}
