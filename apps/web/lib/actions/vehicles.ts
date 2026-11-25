"use server";

import { vehicleScope } from "@/lib/auth/roles";
import { canAdminister, requireUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { maintenanceTarget } from "@/lib/vehicles/detail";
import {
	archiveVehicleSchema,
	createVehicleSchema,
	updateVehicleSchema,
} from "@/lib/vehicles/validation";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const maintenanceSchema = z.object({
	vehicleId: z.string().min(1),
	action: z.enum(["enable", "disable"]),
});

export interface VehicleFormValues {
	plateNo: string;
	make: string;
	model: string;
	year: string;
	vin: string;
	driverName: string;
	driverPhone: string;
	ownerId: string;
}

export interface VehicleFormState {
	ok: boolean;
	error?: "forbidden" | "invalid" | "notfound" | "status" | "owner" | "failed";
	fieldErrors?: Partial<Record<keyof VehicleFormValues, string>>;
	vehicleId?: string;
}

const VEHICLE_FIELDS = new Set<keyof VehicleFormValues>([
	"plateNo",
	"make",
	"model",
	"year",
	"vin",
	"driverName",
	"driverPhone",
	"ownerId",
]);

function localeFrom(formData: FormData): string {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

function isVehicleField(value: string): value is keyof VehicleFormValues {
	return VEHICLE_FIELDS.has(value as keyof VehicleFormValues);
}

function fieldErrorsFrom(error: z.ZodError): Partial<Record<keyof VehicleFormValues, string>> {
	const fieldErrors: Partial<Record<keyof VehicleFormValues, string>> = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		if (typeof field === "string" && isVehicleField(field) && !fieldErrors[field]) {
			fieldErrors[field] = issue.message;
		}
	}
	return fieldErrors;
}

function formValues(formData: FormData): VehicleFormValues {
	return {
		plateNo: String(formData.get("plateNo") ?? ""),
		make: String(formData.get("make") ?? ""),
		model: String(formData.get("model") ?? ""),
		year: String(formData.get("year") ?? ""),
		vin: String(formData.get("vin") ?? ""),
		driverName: String(formData.get("driverName") ?? ""),
		driverPhone: String(formData.get("driverPhone") ?? ""),
		ownerId: String(formData.get("ownerId") ?? ""),
	};
}

function isUniquePlateError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if (!("code" in error) || error.code !== "P2002") return false;
	const meta = "meta" in error ? error.meta : null;
	const target = typeof meta === "object" && meta !== null && "target" in meta ? meta.target : null;
	if (Array.isArray(target)) return target.some((value) => String(value).includes("plateNo"));
	if (typeof target === "string") return target.includes("plateNo");
	return true;
}

function canManageVehicles(role: string): boolean {
	return role === "ADMIN" || role === "USER";
}

interface VehicleSnapshot {
	plateNo: string;
	make: string;
	model: string;
	year: number | null;
	vin: string | null;
	driverName: string | null;
	driverPhone: string | null;
	ownerId: string | null;
	status: string;
}

function snapshot(vehicle: VehicleSnapshot): Prisma.InputJsonObject {
	return {
		plateNo: vehicle.plateNo,
		make: vehicle.make,
		model: vehicle.model,
		year: vehicle.year,
		vin: vehicle.vin,
		driverName: vehicle.driverName,
		driverPhone: vehicle.driverPhone,
		ownerId: vehicle.ownerId,
		status: vehicle.status,
	};
}

/**
 * An admin may assign a vehicle to an active member of the same organization.
 * A revoked membership, another organization's user and an unknown id are all
 * refused with the same message so the form does not leak membership data.
 */
async function resolveOwner(
	orgId: string,
	ownerId: string | undefined,
): Promise<{ ok: true; ownerId: string | null } | { ok: false }> {
	if (!ownerId) return { ok: true, ownerId: null };
	const membership = await prisma.membership.findFirst({
		where: { orgId, userId: ownerId, revokedAt: null },
		select: { userId: true },
	});
	if (!membership) return { ok: false };
	return { ok: true, ownerId: membership.userId };
}

export async function createVehicleAction(
	_previous: VehicleFormState,
	formData: FormData,
): Promise<VehicleFormState> {
	const current = await requireUser();
	if (!canManageVehicles(current.role)) {
		return { ok: false, error: "forbidden" };
	}

	const values = formValues(formData);
	const parsed = createVehicleSchema.safeParse(values);
	if (!parsed.success) {
		return { ok: false, error: "invalid", fieldErrors: fieldErrorsFrom(parsed.error) };
	}
	const data = parsed.data;

	// A vehicle owner registers a vehicle for themselves only. Admin may choose
	// an owner, but never a user from another organization or a revoked member.
	let ownerId: string | null;
	if (current.role === "USER") {
		if (data.ownerId && data.ownerId !== current.user.id) {
			return {
				ok: false,
				error: "forbidden",
				fieldErrors: { ownerId: "You can only register a vehicle for yourself." },
			};
		}
		ownerId = current.user.id;
	} else {
		const resolved = await resolveOwner(current.org.id, data.ownerId);
		if (!resolved.ok) {
			return {
				ok: false,
				error: "owner",
				fieldErrors: { ownerId: "Choose an active member of your organization." },
			};
		}
		ownerId = resolved.ownerId;
	}

	const duplicate = await prisma.vehicle.findFirst({
		where: { orgId: current.org.id, plateNo: data.plateNo },
		select: { id: true },
	});
	if (duplicate) {
		return {
			ok: false,
			error: "invalid",
			fieldErrors: { plateNo: "A vehicle with this plate is already registered." },
		};
	}

	const vehicle = await prisma.vehicle
		.create({
			data: {
				orgId: current.org.id,
				ownerId,
				plateNo: data.plateNo,
				make: data.make,
				model: data.model,
				year: data.year,
				vin: data.vin,
				driverName: data.driverName,
				driverPhone: data.driverPhone,
			},
			select: {
				id: true,
				plateNo: true,
				make: true,
				model: true,
				year: true,
				vin: true,
				driverName: true,
				driverPhone: true,
				ownerId: true,
				status: true,
			},
		})
		.catch((error) => {
			// The pre-check is not atomic; the unique index is the final guard
			// against two admins adding the same plate at once.
			if (isUniquePlateError(error)) return null;
			throw error;
		});
	if (!vehicle) {
		return {
			ok: false,
			error: "invalid",
			fieldErrors: { plateNo: "A vehicle with this plate is already registered." },
		};
	}

	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "vehicle.created",
			target: vehicle.id,
			metadata: { plateNo: vehicle.plateNo, before: null, after: snapshot(vehicle) },
		},
	});

	revalidatePath(`/${localeFrom(formData)}/vehicles`);
	return { ok: true, vehicleId: vehicle.id };
}

export async function updateVehicleAction(
	_previous: VehicleFormState,
	formData: FormData,
): Promise<VehicleFormState> {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canManageVehicles(current.role)) {
		return { ok: false, error: "forbidden" };
	}

	const values = formValues(formData);
	const parsed = updateVehicleSchema.safeParse({
		...values,
		vehicleId: String(formData.get("vehicleId") ?? ""),
	});
	if (!parsed.success) {
		return { ok: false, error: "invalid", fieldErrors: fieldErrorsFrom(parsed.error) };
	}
	const data = parsed.data;

	// The scope filter is the authorization: a USER can only reach a vehicle
	// whose ownerId is their own, and a missing row is reported as not found.
	const existing = await prisma.vehicle.findFirst({
		where: { id: data.vehicleId, ...vehicleScope(current.role, current.org.id, current.user.id) },
		select: {
			id: true,
			plateNo: true,
			make: true,
			model: true,
			year: true,
			vin: true,
			driverName: true,
			driverPhone: true,
			ownerId: true,
			status: true,
		},
	});
	if (!existing) return { ok: false, error: "notfound" };

	let ownerId = existing.ownerId;
	if (current.role === "USER") {
		// Never allow ownership escalation. The form omits the field for an
		// owner, and a crafted request that changes it is refused.
		if (data.ownerId && data.ownerId !== current.user.id) {
			return {
				ok: false,
				error: "forbidden",
				fieldErrors: { ownerId: "You cannot change the owner of a vehicle." },
			};
		}
	} else if (data.ownerId !== undefined) {
		const resolved = await resolveOwner(current.org.id, data.ownerId);
		if (!resolved.ok) {
			return {
				ok: false,
				error: "owner",
				fieldErrors: { ownerId: "Choose an active member of your organization." },
			};
		}
		ownerId = resolved.ownerId;
	}

	if (data.plateNo !== existing.plateNo) {
		const duplicate = await prisma.vehicle.findFirst({
			where: { orgId: current.org.id, plateNo: data.plateNo, id: { not: existing.id } },
			select: { id: true },
		});
		if (duplicate) {
			return {
				ok: false,
				error: "invalid",
				fieldErrors: { plateNo: "A vehicle with this plate is already registered." },
			};
		}
	}

	const after = snapshot({
		...data,
		ownerId,
		status: existing.status,
	});
	const updated = await prisma.vehicle
		.update({
			where: { id: existing.id },
			data: {
				ownerId,
				plateNo: data.plateNo,
				make: data.make,
				model: data.model,
				year: data.year,
				vin: data.vin,
				driverName: data.driverName,
				driverPhone: data.driverPhone,
			},
			select: {
				id: true,
				plateNo: true,
				make: true,
				model: true,
				year: true,
				vin: true,
				driverName: true,
				driverPhone: true,
				ownerId: true,
				status: true,
			},
		})
		.catch((error) => {
			if (isUniquePlateError(error)) return null;
			throw error;
		});
	if (!updated) {
		return {
			ok: false,
			error: "invalid",
			fieldErrors: { plateNo: "A vehicle with this plate is already registered." },
		};
	}

	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "vehicle.updated",
			target: updated.id,
			metadata: { plateNo: updated.plateNo, before: snapshot(existing), after },
		},
	});

	revalidatePath(`/${locale}/vehicles`);
	revalidatePath(`/${locale}/vehicles/${updated.id}`);
	return { ok: true, vehicleId: updated.id };
}

/**
 * Archive, never hard-delete. A vehicle with incidents or a tracker keeps its
 * history, so RETIRED is the only removal this console offers; the delete path
 * that would orphan incidents and devices does not exist.
 */
export async function archiveVehicleAction(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canManageVehicles(current.role)) redirect(`/${locale}/vehicles?error=forbidden`);

	const parsed = archiveVehicleSchema.safeParse({
		vehicleId: String(formData.get("vehicleId") ?? ""),
	});
	if (!parsed.success) redirect(`/${locale}/vehicles?error=invalid`);

	const vehicle = await prisma.vehicle.findFirst({
		where: {
			id: parsed.data.vehicleId,
			...vehicleScope(current.role, current.org.id, current.user.id),
		},
		select: { id: true, plateNo: true, status: true },
	});
	if (!vehicle) redirect(`/${locale}/vehicles?error=notfound`);
	if (vehicle.status === "RETIRED") {
		redirect(`/${locale}/vehicles/${vehicle.id}?tab=settings&error=status`);
	}

	await prisma.$transaction([
		prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: "RETIRED" } }),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "vehicle.archived",
				target: vehicle.id,
				metadata: { plateNo: vehicle.plateNo, from: vehicle.status, to: "RETIRED" },
			},
		}),
	]);

	revalidatePath(`/${locale}/vehicles/${vehicle.id}`);
	revalidatePath(`/${locale}/vehicles`);
	redirect(`/${locale}/vehicles/${vehicle.id}?tab=settings&updated=1`);
}

/**
 * Move a vehicle between ACTIVE and MAINTENANCE. The status is a fleet marker:
 * no incident or alert path reads it, and this action does not touch them.
 */
export async function setMaintenanceModeAction(formData: FormData) {
	const locale = localeFrom(formData);
	const vehicleId = String(formData.get("vehicleId") ?? "");

	const current = await requireUser();
	if (!canAdminister(current.role)) {
		redirect(`/${locale}/vehicles/${vehicleId}?tab=settings&error=forbidden`);
	}

	const parsed = maintenanceSchema.safeParse({
		vehicleId,
		action: formData.get("action"),
	});
	if (!parsed.success) {
		redirect(`/${locale}/vehicles/${vehicleId}?tab=settings&error=invalid`);
	}

	const vehicle = await prisma.vehicle.findFirst({
		where: { id: parsed.data.vehicleId, orgId: current.org.id },
		select: { id: true, plateNo: true, status: true },
	});
	if (!vehicle) redirect(`/${locale}/vehicles?error=notfound`);

	const nextStatus = maintenanceTarget(vehicle.status, parsed.data.action);
	if (!nextStatus) {
		redirect(`/${locale}/vehicles/${vehicle.id}?tab=settings&error=status`);
	}

	await prisma.$transaction([
		prisma.vehicle.update({
			where: { id: vehicle.id },
			data: { status: nextStatus },
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "vehicle.maintenance",
				target: vehicle.id,
				metadata: { plateNo: vehicle.plateNo, from: vehicle.status, to: nextStatus },
			},
		}),
	]);

	revalidatePath(`/${locale}/vehicles/${vehicle.id}`);
	revalidatePath(`/${locale}/vehicles`);
	redirect(`/${locale}/vehicles/${vehicle.id}?tab=settings&updated=1`);
}
