import { describe, expect, it } from "vitest";
import {
	MEMBER_ROLES,
	canAdminister,
	canManageIncidents,
	canViewAllVehicles,
	canViewDevices,
	isMemberRole,
	roleLabelKey,
	vehicleRelationScope,
	vehicleScope,
} from "./roles";

describe("member roles", () => {
	it("accepts only the three LifeLink roles", () => {
		expect(MEMBER_ROLES).toEqual(["USER", "RESPONDER", "ADMIN"]);
		expect(isMemberRole("USER")).toBe(true);
		expect(isMemberRole("RESPONDER")).toBe(true);
		expect(isMemberRole("ADMIN")).toBe(true);
		expect(isMemberRole("OWNER")).toBe(false);
		expect(isMemberRole("OPERATOR")).toBe(false);
		expect(isMemberRole(undefined)).toBe(false);
	});

	it("scopes a vehicle owner to their own vehicles", () => {
		expect(vehicleScope("USER", "org-1", "user-1")).toEqual({
			orgId: "org-1",
			ownerId: "user-1",
		});
		expect(vehicleRelationScope("USER", "user-1")).toEqual({ ownerId: "user-1" });
	});

	it("gives responders and admins the whole organization fleet", () => {
		expect(vehicleScope("RESPONDER", "org-1", "user-1")).toEqual({ orgId: "org-1" });
		expect(vehicleScope("ADMIN", "org-1", "user-1")).toEqual({ orgId: "org-1" });
		expect(canViewAllVehicles("RESPONDER")).toBe(true);
		expect(canViewAllVehicles("ADMIN")).toBe(true);
		expect(canViewAllVehicles("USER")).toBe(false);
	});

	it("reserves administration and device management for admins", () => {
		expect(canAdminister("ADMIN")).toBe(true);
		expect(canAdminister("RESPONDER")).toBe(false);
		expect(canAdminister("USER")).toBe(false);
		expect(canViewDevices("ADMIN")).toBe(true);
		expect(canViewDevices("RESPONDER")).toBe(false);
	});

	it("lets every role work incidents inside its scope", () => {
		for (const role of MEMBER_ROLES) expect(canManageIncidents(role)).toBe(true);
	});

	it("maps each role to its display label", () => {
		expect(roleLabelKey("USER")).toBe("user");
		expect(roleLabelKey("RESPONDER")).toBe("responder");
		expect(roleLabelKey("ADMIN")).toBe("admin");
	});
});
