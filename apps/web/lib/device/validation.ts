import { z } from "zod";

/** Canonical tracker MAC format: six upper-case hex pairs separated by colons. */
export const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/**
 * Normalize a MAC address to AA:BB:CC:DD:EE:FF.
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
	.refine((value) => MAC_REGEX.test(value), "Use a MAC address like AA:BB:CC:DD:EE:FF.");

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

export const commandSchema = z.enum(["LOCATE", "ARM", "DISARM", "TEST_ALERT", "SET_CONFIG"]);
