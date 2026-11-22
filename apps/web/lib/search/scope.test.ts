import { describe, expect, it } from "vitest";
import { awaitingIncidentWhere, canSearchDevices, ownedVehicleRelation } from "./scope";

describe("ownedVehicleRelation", () => {
	it("scopes a vehicle owner to their own vehicles", () => {
		expect(ownedVehicleRelation("USER", "user-1")).toEqual({
			vehicle: { is: { ownerId: "user-1" } },
		});
	});

	it("leaves responders and admins at organisation scope", () => {
		expect(ownedVehicleRelation("RESPONDER", "user-1")).toEqual({});
		expect(ownedVehicleRelation("ADMIN", "user-1")).toEqual({});
	});
});

describe("awaitingIncidentWhere", () => {
	const base = { orgId: "org-1" };

	it("matches the dashboard awaiting count: suspected and confirmed only", () => {
		expect(awaitingIncidentWhere({ role: "ADMIN", ...base, userId: "user-1" })).toEqual({
			orgId: "org-1",
			status: { in: ["SUSPECTED", "CONFIRMED"] },
		});
	});

	it("adds the owner relation for a vehicle owner", () => {
		expect(awaitingIncidentWhere({ role: "USER", ...base, userId: "user-1" })).toEqual({
			orgId: "org-1",
			vehicle: { is: { ownerId: "user-1" } },
			status: { in: ["SUSPECTED", "CONFIRMED"] },
		});
	});
});

describe("canSearchDevices", () => {
	it("keeps tracker results admin-only", () => {
		expect(canSearchDevices("ADMIN")).toBe(true);
		expect(canSearchDevices("RESPONDER")).toBe(false);
		expect(canSearchDevices("USER")).toBe(false);
	});
});
