import { z } from "zod";

/** Canonical tracker MAC format: six upper-case hex pairs separated by colons. */
export const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/**
 * Normalize a MAC address to six upper-case hex pairs, colon-separated.
 *
 * Colon, hyphen, dotted-group and bare 12-hex-digit input are accepted. Invalid
 * input is returned trimmed and upper-cased so the schema can report the format
 * error instead of silently accepting a different value.
 */
export function normalizeMac(input: string): string {
	const compact = input
		.trim()
		.replace(/[\s:.-]/g, "")
		.toUpperCase();
	if (!/^[0-9A-F]{12}$/.test(compact)) return input.trim().toUpperCase();
	return compact.match(/.{2}/g)?.join(":") ?? compact;
}

export const macSchema = z
	.string()
	.trim()
	.transform(normalizeMac)
	.refine((value) => MAC_REGEX.test(value), "Use a MAC address like 24:0A:C4:9F:2A:71.");

export const createDeviceSchema = z.object({
	mac: macSchema,
	label: z.string().trim().min(2, "Enter a device label.").max(80, "Use 80 characters or fewer."),
	vehicleId: z.string().trim().optional(),
});

export const updateDeviceSchema = z.object({
	deviceId: z.string().trim().min(1),
	label: z.string().trim().min(2, "Enter a device label.").max(80),
	vehicleId: z.string().trim().optional(),
});

export const deleteDeviceSchema = z.object({
	deviceId: z.string().trim().min(1),
});

/**
 * Commands an admin may queue from the tracker page.
 *
 * ARM and DISARM are deliberately absent: crash detection is always on, so
 * queuing either command would claim a behaviour the firmware does not have.
 * The Prisma enum keeps both values for historical rows.
 */
export const commandSchema = z.enum(["LOCATE", "TEST_ALERT", "SET_CONFIG"]);

export type DeviceCommandKind = z.infer<typeof commandSchema>;
