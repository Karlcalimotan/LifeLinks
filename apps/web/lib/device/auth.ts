import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError, unauthorized } from "@/lib/api/errors";
import { DEVICE_TOKEN_HEADER, DEVICE_TOKEN_PREFIX } from "@/lib/constants";
import prisma from "@/lib/prisma";

export function hashDeviceToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function generateDeviceToken(): string {
	return `${DEVICE_TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

/**
 * Look up a device by the hash of its token, then confirm in constant time.
 * The plaintext token is never stored: a leaked database row cannot be used to
 * impersonate a tracker.
 */
export async function verifyDeviceToken(token: string) {
	const tokenHash = hashDeviceToken(token);
	const device = await prisma.trackerDevice.findUnique({ where: { tokenHash } });
	if (!device) return null;

	const expected = Buffer.from(tokenHash, "hex");
	const actual = Buffer.from(device.tokenHash, "hex");
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
		return null;
	}
	return device;
}

export function isDeviceApproved(device: { approvalStatus: string }): boolean {
	return device.approvalStatus === "APPROVED";
}

export interface AuthenticatedDevice {
	device: Awaited<ReturnType<typeof verifyDeviceToken>> & object;
}

export async function requireDevice(request: Request) {
	const token = request.headers.get(DEVICE_TOKEN_HEADER);
	if (!token) throw unauthorized("Missing device token.");

	const device = await verifyDeviceToken(token);
	if (!device) throw unauthorized("Unknown device token.");
	if (!isDeviceApproved(device)) {
		throw new ApiError(403, "FORBIDDEN", "Device is not approved.");
	}
	return device;
}
