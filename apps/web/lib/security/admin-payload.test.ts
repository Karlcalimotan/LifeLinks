import {
	ADMIN_DEVICE_LIST_SELECT,
	type AdminDeviceListRow,
	toAdminDeviceListItem,
} from "@/lib/device/admin-payload";
import { INCIDENT_DETAIL_SELECT } from "@/lib/incidents/payload";
import {
	PLATFORM_ORG_LIST_SELECT,
	type PlatformOrgRow,
	toPlatformOrgListItem,
} from "@/lib/platform/orgs";
import { MEMBER_LIST_SELECT } from "@/lib/settings/member-payload";
import {
	MAP_VEHICLE_SELECT,
	VEHICLE_DETAIL_SELECT,
	VEHICLE_LIST_SELECT,
} from "@/lib/vehicles/payload";
import { describe, expect, it } from "vitest";

const FORBIDDEN_KEYS = [
	"tokenHash",
	"passwordHash",
	"p256dh",
	"auth",
	"endpoint",
	"token",
	"invitationTokenHash",
] as const;

function collectKeys(value: unknown, keys: string[] = []): string[] {
	if (Array.isArray(value)) {
		for (const entry of value) collectKeys(entry, keys);
		return keys;
	}
	if (typeof value !== "object" || value === null) return keys;
	for (const [key, child] of Object.entries(value)) {
		keys.push(key);
		collectKeys(child, keys);
	}
	return keys;
}

describe("admin payload hygiene", () => {
	it("never selects a secret field for any admin list or detail", () => {
		const keys = collectKeys([
			PLATFORM_ORG_LIST_SELECT,
			ADMIN_DEVICE_LIST_SELECT,
			MEMBER_LIST_SELECT,
			VEHICLE_LIST_SELECT,
			VEHICLE_DETAIL_SELECT,
			MAP_VEHICLE_SELECT,
			INCIDENT_DETAIL_SELECT,
		]);
		for (const forbidden of FORBIDDEN_KEYS) {
			expect(keys, `unexpected ${forbidden} in an admin select`).not.toContain(forbidden);
		}
	});

	it("copies only the platform organization list fields", () => {
		const row = {
			id: "org-1",
			name: "Acme Fleet",
			slug: "acme",
			status: "ACTIVE",
			createdAt: new Date("2026-11-01T00:00:00.000Z"),
			suspendedAt: null,
			suspendedReason: null,
			suspendedBy: null,
			memberships: [{ revokedAt: null }, { revokedAt: new Date() }],
			// A Prisma row with `include` would carry these; the mapper must drop them.
			tokenHash: "device-secret",
			passwordHash: "password-secret",
			p256dh: "push-secret",
			auth: "push-auth-secret",
			token: "llk_raw_device_token",
		} as unknown as PlatformOrgRow;

		const item = toPlatformOrgListItem(row);

		expect(item.activeMembers).toBe(1);
		expect(Object.keys(item).sort()).toEqual([
			"activeMembers",
			"createdAt",
			"id",
			"name",
			"slug",
			"status",
			"suspendedAt",
			"suspendedBy",
			"suspendedReason",
		]);
		const serialized = JSON.stringify(item);
		for (const secret of [
			"device-secret",
			"password-secret",
			"push-secret",
			"push-auth-secret",
			"llk_raw_device_token",
		]) {
			expect(serialized).not.toContain(secret);
		}
	});

	it("copies only the tracker list fields", () => {
		const row = {
			id: "device-1",
			label: "Navara NDR 4821",
			mac: "24:6F:28:C4:1E:7A",
			approvalStatus: "APPROVED",
			lastSeenAt: null,
			rssiDbm: -63,
			batteryV: 12.7,
			firmwareVersion: "0.2.0",
			vehicle: { plateNo: "NDR 4821" },
			tokenHash: "device-secret",
			passwordHash: "password-secret",
			p256dh: "push-secret",
			auth: "push-auth-secret",
			token: "llk_raw_device_token",
		} as unknown as AdminDeviceListRow;

		const item = toAdminDeviceListItem(row);

		expect(Object.keys(item).sort()).toEqual([
			"approvalStatus",
			"batteryV",
			"firmwareVersion",
			"id",
			"label",
			"lastSeenAt",
			"mac",
			"rssiDbm",
			"vehicle",
		]);
		const serialized = JSON.stringify(item);
		for (const secret of [
			"device-secret",
			"password-secret",
			"push-secret",
			"push-auth-secret",
			"llk_raw_device_token",
		]) {
			expect(serialized).not.toContain(secret);
		}
	});
});
