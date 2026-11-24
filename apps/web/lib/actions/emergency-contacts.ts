"use server";

import { type MemberRoleName, vehicleRelationScope, vehicleScope } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {
	archiveContactSchema,
	createContactSchema,
	updateContactSchema,
} from "@/lib/vehicles/validation";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

export type ContactError = "forbidden" | "invalid" | "notfound" | "vehicle" | "duplicate";

export interface ContactFormValues {
	name: string;
	phone: string;
	email: string;
	vehicleId: string;
}

export interface EmergencyContactFormState {
	ok: boolean;
	error?: ContactError;
	fieldErrors?: Partial<Record<keyof ContactFormValues, string>>;
	contactId?: string;
}

interface ContactSnapshot {
	name: string;
	phone: string;
	email: string | null;
	active: boolean;
	vehicleId: string | null;
}

const CONTACT_FIELDS = new Set<keyof ContactFormValues>(["name", "phone", "email", "vehicleId"]);

function localeFrom(formData: FormData): string {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

function isContactField(value: string): value is keyof ContactFormValues {
	return CONTACT_FIELDS.has(value as keyof ContactFormValues);
}

function fieldErrorsFrom(error: ZodError): Partial<Record<keyof ContactFormValues, string>> {
	const fieldErrors: Partial<Record<keyof ContactFormValues, string>> = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		if (typeof field === "string" && isContactField(field) && !fieldErrors[field]) {
			fieldErrors[field] = issue.message;
		}
	}
	return fieldErrors;
}

function formValues(formData: FormData): ContactFormValues {
	return {
		name: String(formData.get("name") ?? ""),
		phone: String(formData.get("phone") ?? ""),
		email: String(formData.get("email") ?? ""),
		vehicleId: String(formData.get("vehicleId") ?? ""),
	};
}

function snapshot(contact: ContactSnapshot): Prisma.InputJsonObject {
	return {
		name: contact.name,
		phone: contact.phone,
		email: contact.email,
		active: contact.active,
		vehicleId: contact.vehicleId,
	};
}

function isUniquePhoneError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if (!("code" in error) || error.code !== "P2002") return false;
	const meta = "meta" in error ? error.meta : null;
	const target = typeof meta === "object" && meta !== null && "target" in meta ? meta.target : null;
	if (Array.isArray(target)) return target.some((value) => String(value).includes("phone"));
	if (typeof target === "string") return target.includes("phone");
	return true;
}

function canManageContacts(role: string): boolean {
	return role === "ADMIN" || role === "USER";
}

const DUPLICATE_PHONE = "This phone is already an emergency contact in your organization.";

/**
 * Resolve the target vehicle inside the caller's scope. An owner may only use
 * their own vehicle; an admin may use any vehicle in the org. A null vehicle is
 * the organisation-level fallback list and only an admin may write it.
 */
async function resolveVehicle(
	current: { role: MemberRoleName; org: { id: string }; user: { id: string } },
	vehicleId: string | undefined,
): Promise<
	| { ok: true; vehicleId: string | null }
	| {
			ok: false;
			error: ContactError;
			fieldErrors?: Partial<Record<keyof ContactFormValues, string>>;
	  }
> {
	if (!vehicleId) {
		if (current.role !== "ADMIN") {
			return {
				ok: false,
				error: "forbidden",
				fieldErrors: { vehicleId: "Choose one of your vehicles." },
			};
		}
		return { ok: true, vehicleId: null };
	}

	const vehicle = await prisma.vehicle.findFirst({
		where: { id: vehicleId, ...vehicleScope(current.role, current.org.id, current.user.id) },
		select: { id: true },
	});
	if (!vehicle) {
		return {
			ok: false,
			error: "vehicle",
			fieldErrors: { vehicleId: "Choose a vehicle from your organization." },
		};
	}
	return { ok: true, vehicleId: vehicle.id };
}

/** The query filter that proves a contact is inside the caller's scope. */
function contactScope(current: {
	role: MemberRoleName;
	org: { id: string };
	user: { id: string };
}) {
	return {
		orgId: current.org.id,
		...(current.role === "USER"
			? { vehicle: vehicleRelationScope(current.role, current.user.id) }
			: {}),
	};
}

async function duplicatePhone(orgId: string, phone: string, exceptId?: string): Promise<boolean> {
	const existing = await prisma.emergencyContact.findFirst({
		where: { orgId, phone, ...(exceptId ? { id: { not: exceptId } } : {}) },
		select: { id: true },
	});
	return existing != null;
}

export async function createEmergencyContactAction(
	_previous: EmergencyContactFormState,
	formData: FormData,
): Promise<EmergencyContactFormState> {
	const current = await requireUser();
	if (!canManageContacts(current.role)) return { ok: false, error: "forbidden" };

	const values = formValues(formData);
	const parsed = createContactSchema.safeParse({
		...values,
		active: formData.get("active") === "on",
	});
	if (!parsed.success) {
		return { ok: false, error: "invalid", fieldErrors: fieldErrorsFrom(parsed.error) };
	}
	const data = parsed.data;

	const vehicle = await resolveVehicle(current, data.vehicleId);
	if (!vehicle.ok) {
		return { ok: false, error: vehicle.error, fieldErrors: vehicle.fieldErrors };
	}

	if (await duplicatePhone(current.org.id, data.phone)) {
		return { ok: false, error: "duplicate", fieldErrors: { phone: DUPLICATE_PHONE } };
	}

	const contact = await prisma.emergencyContact
		.create({
			data: {
				orgId: current.org.id,
				vehicleId: vehicle.vehicleId,
				name: data.name,
				phone: data.phone,
				email: data.email,
				active: data.active,
			},
			select: { id: true, name: true, phone: true, email: true, active: true, vehicleId: true },
		})
		.catch((error) => {
			// The unique index is the final guard when two requests race.
			if (isUniquePhoneError(error)) return null;
			throw error;
		});
	if (!contact) {
		return { ok: false, error: "duplicate", fieldErrors: { phone: DUPLICATE_PHONE } };
	}

	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "emergency_contact.created",
			target: contact.id,
			metadata: { before: null, after: snapshot(contact) },
		},
	});

	const locale = localeFrom(formData);
	revalidatePath(`/${locale}/vehicles`);
	if (contact.vehicleId) revalidatePath(`/${locale}/vehicles/${contact.vehicleId}`);
	return { ok: true, contactId: contact.id };
}

export async function updateEmergencyContactAction(
	_previous: EmergencyContactFormState,
	formData: FormData,
): Promise<EmergencyContactFormState> {
	const current = await requireUser();
	if (!canManageContacts(current.role)) return { ok: false, error: "forbidden" };

	const values = formValues(formData);
	const parsed = updateContactSchema.safeParse({
		...values,
		contactId: String(formData.get("contactId") ?? ""),
		active: formData.get("active") === "on",
	});
	if (!parsed.success) {
		return { ok: false, error: "invalid", fieldErrors: fieldErrorsFrom(parsed.error) };
	}
	const data = parsed.data;

	// A USER reaches only contacts on a vehicle they own; an org-level contact
	// (vehicleId null) and another owner's contact both fall out of the scope.
	const existing = await prisma.emergencyContact.findFirst({
		where: { id: data.contactId, ...contactScope(current) },
		select: {
			id: true,
			name: true,
			phone: true,
			email: true,
			active: true,
			vehicleId: true,
		},
	});
	if (!existing) return { ok: false, error: "notfound" };

	// An owner cannot unassign a contact to the organisation list, and an
	// omitted vehicle keeps the contact where it is. An admin may explicitly
	// clear it to move the contact to the organisation fallback.
	const requestedVehicleId =
		current.role === "USER"
			? data.vehicleId || existing.vehicleId || undefined
			: data.vehicleId || undefined;
	const vehicle = await resolveVehicle(current, requestedVehicleId);
	if (!vehicle.ok) {
		return { ok: false, error: vehicle.error, fieldErrors: vehicle.fieldErrors };
	}

	if (await duplicatePhone(current.org.id, data.phone, existing.id)) {
		return { ok: false, error: "duplicate", fieldErrors: { phone: DUPLICATE_PHONE } };
	}

	const after = snapshot({
		name: data.name,
		phone: data.phone,
		email: data.email,
		active: data.active,
		vehicleId: vehicle.vehicleId,
	});
	const updated = await prisma.emergencyContact
		.update({
			where: { id: existing.id },
			data: {
				vehicleId: vehicle.vehicleId,
				name: data.name,
				phone: data.phone,
				email: data.email,
				active: data.active,
			},
			select: { id: true, name: true, phone: true, email: true, active: true, vehicleId: true },
		})
		.catch((error) => {
			if (isUniquePhoneError(error)) return null;
			throw error;
		});
	if (!updated) {
		return { ok: false, error: "duplicate", fieldErrors: { phone: DUPLICATE_PHONE } };
	}

	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "emergency_contact.updated",
			target: updated.id,
			metadata: { before: snapshot(existing), after },
		},
	});

	const locale = localeFrom(formData);
	revalidatePath(`/${locale}/vehicles`);
	if (updated.vehicleId) revalidatePath(`/${locale}/vehicles/${updated.vehicleId}`);
	if (existing.vehicleId && existing.vehicleId !== updated.vehicleId) {
		revalidatePath(`/${locale}/vehicles/${existing.vehicleId}`);
	}
	return { ok: true, contactId: updated.id };
}

/**
 * Archive sets `active` to false; the row stays for the audit trail and the
 * alert paths ignore it. A RE-invite to the alert list is an edit that checks
 * `active` again and is audited as an update.
 */
export async function archiveEmergencyContactAction(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canManageContacts(current.role)) redirect(`/${locale}/vehicles?error=forbidden`);

	const parsed = archiveContactSchema.safeParse({
		contactId: String(formData.get("contactId") ?? ""),
	});
	if (!parsed.success) redirect(`/${locale}/vehicles?error=invalid`);

	const contact = await prisma.emergencyContact.findFirst({
		where: { id: parsed.data.contactId, ...contactScope(current) },
		select: {
			id: true,
			name: true,
			phone: true,
			email: true,
			active: true,
			vehicleId: true,
		},
	});
	if (!contact) redirect(`/${locale}/vehicles?error=notfound`);

	await prisma.$transaction([
		prisma.emergencyContact.update({ where: { id: contact.id }, data: { active: false } }),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "emergency_contact.archived",
				target: contact.id,
				metadata: {
					before: snapshot(contact),
					after: snapshot({ ...contact, active: false }),
				},
			},
		}),
	]);

	revalidatePath(`/${locale}/vehicles`);
	if (contact.vehicleId) {
		revalidatePath(`/${locale}/vehicles/${contact.vehicleId}`);
		redirect(`/${locale}/vehicles/${contact.vehicleId}?tab=settings&archived=1`);
	}
	redirect(`/${locale}/vehicles?archived=1`);
}
