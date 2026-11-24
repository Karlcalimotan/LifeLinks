import { normalizePhone } from "@/lib/alerts/templates";
import { z } from "zod";

/**
 * Bounded validation for the vehicle and emergency-contact console forms.
 * The schemas are pure so the actions stay a short sequence of authorize,
 * parse, scope-check, mutate and audit.
 */

const PHONE_MESSAGE = "Use a phone number with 10 to 15 digits, for example +63 917 123 4567.";

/** Trimmed text with an explicit maximum; a blank optional field becomes null. */
function optionalText(max: number, message: string) {
	return z
		.string()
		.trim()
		.max(max, message)
		.transform((value) => (value.length > 0 ? value : null));
}

export const plateSchema = z
	.string()
	.trim()
	.min(2, "Enter a plate number.")
	.max(20, "Use 20 characters or fewer.")
	.transform((value) => value.replace(/\s+/g, " ").toUpperCase());

export const vehicleFormSchema = z.object({
	plateNo: plateSchema,
	make: z.string().trim().min(1, "Enter the make.").max(60, "Use 60 characters or fewer."),
	model: z.string().trim().min(1, "Enter the model.").max(60, "Use 60 characters or fewer."),
	year: z.preprocess(
		(value) => (value === "" || value == null ? null : Number(value)),
		z
			.number()
			.int("Use a whole year.")
			.min(1900, "Use a year from 1900 or later.")
			.max(2100, "Use a year from 2100 or earlier.")
			.nullable(),
	),
	vin: optionalText(40, "Use 40 characters or fewer.").transform((value) =>
		value ? value.toUpperCase() : null,
	),
	driverName: optionalText(120, "Use 120 characters or fewer."),
	driverPhone: z
		.string()
		.trim()
		.max(30, "Use 30 characters or fewer.")
		.refine((value) => value === "" || normalizePhone(value) != null, PHONE_MESSAGE)
		.transform((value) => (value === "" ? null : normalizePhone(value))),
});

export const createVehicleSchema = vehicleFormSchema.extend({
	ownerId: z.string().trim().max(64).optional(),
});

export const updateVehicleSchema = vehicleFormSchema.extend({
	vehicleId: z.string().trim().min(1),
	ownerId: z.string().trim().max(64).optional(),
});

export const archiveVehicleSchema = z.object({
	vehicleId: z.string().trim().min(1),
});

export const contactFormSchema = z.object({
	name: z.string().trim().min(1, "Enter a name.").max(120, "Use 120 characters or fewer."),
	phone: z
		.string()
		.trim()
		.min(1, "Enter a phone number.")
		.max(30, "Use 30 characters or fewer.")
		.refine((value) => normalizePhone(value) != null, PHONE_MESSAGE)
		.transform((value) => normalizePhone(value) as string),
	email: z
		.string()
		.trim()
		.max(160, "Use 160 characters or fewer.")
		.refine(
			(value) => value === "" || z.string().email().safeParse(value).success,
			"Enter a valid email address or leave it blank.",
		)
		.transform((value) => (value === "" ? null : value.toLowerCase())),
	vehicleId: z.string().trim().max(64).optional(),
});

export const createContactSchema = contactFormSchema.extend({
	active: z.boolean(),
});

export const updateContactSchema = contactFormSchema.extend({
	contactId: z.string().trim().min(1),
	active: z.boolean(),
});

export const archiveContactSchema = z.object({
	contactId: z.string().trim().min(1),
});
