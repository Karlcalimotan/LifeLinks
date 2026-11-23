"use server";

import { canAdminister, requireUser } from "@/lib/auth/session";
import { generateDeviceToken, hashDeviceToken } from "@/lib/device/auth";
import { parseBulkDeviceIds } from "@/lib/device/bulk";
import { TOKEN_ROTATION_RATE_LIMIT } from "@/lib/device/limits";
import {
	commandSchema,
	createDeviceSchema,
	deleteDeviceSchema,
	updateDeviceSchema,
} from "@/lib/device/validation";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
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
	errorCode?: "rate_limited";
	retryAfterSeconds?: number;
	fieldErrors?: DeviceFormFieldErrors;
	values?: DeviceFormValues;
	token?: string;
	mac?: string;
}

export interface DeviceEditState {
	ok: boolean;
	error?: string;
}

export type BulkApproveError = "forbidden" | "invalid" | "too_many" | "none" | "failed";

export interface BulkApproveState {
	ok: boolean;
	approved?: number;
	skipped?: number;
	failed?: number;
	error?: BulkApproveError;
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
	const limit = rateLimit(
		`device-token:${current.user.id}:${deviceId}`,
		TOKEN_ROTATION_RATE_LIMIT.limit,
		TOKEN_ROTATION_RATE_LIMIT.windowMs,
	);
	if (!limit.allowed) {
		return {
			ok: false,
			errorCode: "rate_limited",
			retryAfterSeconds: limit.retryAfterSeconds,
		};
	}

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

export async function bulkApproveDevicesAction(
	_previous: BulkApproveState,
	formData: FormData,
): Promise<BulkApproveState> {
	const current = await requireUser();
	if (!canAdminister(current.role)) {
		return { ok: false, error: "forbidden" };
	}

	const selection = parseBulkDeviceIds(formData.getAll("deviceIds").map(String));
	if (selection.overflow) return { ok: false, error: "too_many" };
	if (selection.ids.length === 0) return { ok: false, error: "invalid" };

	const pending = await prisma.trackerDevice.findMany({
		where: {
			id: { in: selection.ids },
			orgId: current.org.id,
			approvalStatus: "PENDING",
		},
		select: { id: true, mac: true },
	});

	if (pending.length === 0) {
		return {
			ok: false,
			approved: 0,
			skipped: selection.ids.length,
			failed: 0,
			error: "none",
		};
	}

	let approved = 0;
	let skipped = selection.ids.length - pending.length;
	let failed = 0;
	for (const device of pending) {
		try {
			const updated = await prisma.$transaction(async (tx) => {
				const result = await tx.trackerDevice.updateMany({
					where: {
						id: device.id,
						orgId: current.org.id,
						approvalStatus: "PENDING",
					},
					data: { approvalStatus: "APPROVED" },
				});
				if (result.count !== 1) return 0;

				await tx.auditLog.create({
					data: {
						orgId: current.org.id,
						actorId: current.user.id,
						action: "device.approved",
						target: device.id,
						metadata: { mac: device.mac, previousStatus: "PENDING", bulk: true },
					},
				});
				return 1;
			});
			if (updated === 1) approved += 1;
			else skipped += 1;
		} catch {
			// A database failure is reported separately from an id that the
			// candidate query filtered out. Other devices still proceed.
			failed += 1;
		}
	}

	revalidatePath(`/${localeFrom(formData)}/devices`);

	if (approved === 0) {
		return {
			ok: false,
			approved,
			skipped,
			failed,
			error: failed > 0 ? "failed" : "none",
		};
	}
	return { ok: true, approved, skipped, failed };
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
