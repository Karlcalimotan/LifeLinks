"use server";

import { canAdminister, requireUser } from "@/lib/auth/session";
import { generateDeviceToken, hashDeviceToken } from "@/lib/device/auth";
import { commandSchema, createDeviceSchema } from "@/lib/device/validation";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

export interface DeviceFormValues {
	mac: string;
	label: string;
	vehicleId: string;
}

export interface DeviceFormFieldErrors {
	mac?: string;
	label?: string;
	vehicleId?: string;
}

export interface DeviceTokenState {
	ok: boolean;
	error?: string;
	fieldErrors?: DeviceFormFieldErrors;
	values?: DeviceFormValues;
	token?: string;
	mac?: string;
}

const DEVICE_FIELDS = new Set(["mac", "label", "vehicleId"]);
const DUPLICATE_MAC = "A tracker with this MAC is already registered.";

function isDeviceField(value: string): value is keyof DeviceFormFieldErrors {
	return DEVICE_FIELDS.has(value);
}

function fieldErrorsFrom(error: ZodError): DeviceFormFieldErrors {
	const fieldErrors: DeviceFormFieldErrors = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		if (typeof field === "string" && isDeviceField(field) && !fieldErrors[field]) {
			fieldErrors[field] = issue.message;
		}
	}
	return fieldErrors;
}

function isUniqueMacError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if (!("code" in error) || error.code !== "P2002") return false;
	const meta = "meta" in error ? error.meta : null;
	const target = typeof meta === "object" && meta !== null && "target" in meta ? meta.target : null;
	if (Array.isArray(target)) return target.some((value) => String(value).includes("mac"));
	if (typeof target === "string") return target.includes("mac");
	return true;
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

	const values: DeviceFormValues = {
		mac: String(formData.get("mac") ?? ""),
		label: String(formData.get("label") ?? ""),
		vehicleId: String(formData.get("vehicleId") ?? ""),
	};
	const parsed = createDeviceSchema.safeParse(values);
	if (!parsed.success) {
		return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values };
	}

	const mac = parsed.data.mac;
	const existing = await prisma.trackerDevice.findUnique({ where: { mac }, select: { id: true } });
	if (existing) return { ok: false, fieldErrors: { mac: DUPLICATE_MAC }, values };

	const vehicleId = parsed.data.vehicleId || null;
	if (vehicleId) {
		const vehicle = await prisma.vehicle.findFirst({
			where: { id: vehicleId, orgId: current.org.id },
			select: { id: true },
		});
		if (!vehicle) {
			return {
				ok: false,
				fieldErrors: { vehicleId: "Choose a vehicle from your organization." },
				values,
			};
		}
	}

	const token = generateDeviceToken();
	const device = await prisma.trackerDevice
		.create({
			data: {
				orgId: current.org.id,
				vehicleId,
				mac,
				label: parsed.data.label,
				tokenHash: hashDeviceToken(token),
				approvalStatus: "APPROVED",
			},
		})
		.catch((error) => {
			// The pre-check above is not atomic; the unique index is the final
			// guard against two admins registering the same MAC at once.
			if (isUniqueMacError(error)) return null;
			throw error;
		});
	if (!device) return { ok: false, fieldErrors: { mac: DUPLICATE_MAC }, values };

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
	await prisma.trackerDevice.updateMany({
		where: { id: deviceId, orgId: current.org.id },
		data: { approvalStatus: "APPROVED" },
	});
	revalidatePath(`/${locale}/devices/${deviceId}`);
	revalidatePath(`/${locale}/devices`);
	redirect(`/${locale}/devices/${deviceId}`);
}

export async function rejectDeviceAction(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canAdminister(current.role)) redirect(`/${locale}/devices?error=forbidden`);

	const deviceId = String(formData.get("deviceId") ?? "");
	await prisma.trackerDevice.updateMany({
		where: { id: deviceId, orgId: current.org.id },
		data: { approvalStatus: "REJECTED" },
	});
	revalidatePath(`/${locale}/devices/${deviceId}`);
	revalidatePath(`/${locale}/devices`);
	redirect(`/${locale}/devices/${deviceId}`);
}
