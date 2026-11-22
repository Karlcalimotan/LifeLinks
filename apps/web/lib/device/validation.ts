import { z } from "zod";

export const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export function normalizeMac(input: string): string {
	return input.trim().replace(/-/g, ":").toUpperCase();
}

export const createDeviceSchema = z.object({
	mac: z.string().trim().regex(MAC_REGEX, "Use a MAC address like AA:BB:CC:DD:EE:FF."),
	label: z.string().trim().min(2, "Enter a device label.").max(80),
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
