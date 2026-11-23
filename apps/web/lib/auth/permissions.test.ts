import { describe, expect, it } from "vitest";
import {
	PERMISSION_KEYS,
	isPermissionKey,
	knownOverrides,
	resolvePermission,
	resolvePermissions,
	rolePermissionDefaults,
} from "./permissions";

describe("role defaults", () => {
	it("keeps bureau acknowledgement with responders and admins", () => {
		// #105 made acknowledgement a tracker command for the responding bureau,
		// so the USER default is false; an explicit override can still grant it.
		expect(rolePermissionDefaults("USER")["incident.acknowledge"]).toBe(false);
		for (const role of ["RESPONDER", "ADMIN"] as const) {
			expect(rolePermissionDefaults(role)["incident.acknowledge"]).toBe(true);
		}
	});

	it("lets every role resolve incidents and reserves administration", () => {
		for (const role of ["USER", "RESPONDER", "ADMIN"] as const) {
			expect(rolePermissionDefaults(role)["incident.resolve"]).toBe(true);
		}
		expect(rolePermissionDefaults("USER")["device.configure"]).toBe(false);
		expect(rolePermissionDefaults("RESPONDER")["device.configure"]).toBe(false);
		expect(rolePermissionDefaults("ADMIN")["device.configure"]).toBe(true);
		expect(rolePermissionDefaults("RESPONDER")["members.manage"]).toBe(false);
		expect(rolePermissionDefaults("ADMIN")["members.manage"]).toBe(true);
	});

	it("returns a copy that cannot mutate the table", () => {
		const defaults = rolePermissionDefaults("USER");
		defaults["members.manage"] = true;
		expect(rolePermissionDefaults("USER")["members.manage"]).toBe(false);
	});
});

describe("permission resolution", () => {
	it("uses the role default when there is no override", () => {
		expect(resolvePermission("RESPONDER", [], "device.configure")).toBe(false);
		expect(resolvePermission("RESPONDER", [], "incident.acknowledge")).toBe(true);
		expect(resolvePermission("USER", [], "members.manage")).toBe(false);
	});

	it("lets an override grant a capability the role does not have", () => {
		const overrides = [{ key: "device.configure", allowed: true }];
		expect(resolvePermission("RESPONDER", overrides, "device.configure")).toBe(true);
	});

	it("lets an override take a capability away", () => {
		const overrides = [{ key: "incident.acknowledge", allowed: false }];
		expect(resolvePermission("RESPONDER", overrides, "incident.acknowledge")).toBe(false);
		// A different key is untouched.
		expect(resolvePermission("RESPONDER", overrides, "incident.resolve")).toBe(true);
	});

	it("ignores unknown keys in the override list", () => {
		const overrides = [
			{ key: "incident.acknowledge", allowed: true },
			{ key: "root.everything", allowed: true },
		];
		expect(isPermissionKey("root.everything")).toBe(false);
		expect(resolvePermission("USER", overrides, "device.configure")).toBe(false);
		expect(knownOverrides(overrides)).toEqual([{ key: "incident.acknowledge", allowed: true }]);
	});

	it("never downgrades an admin", () => {
		const overrides = PERMISSION_KEYS.map((key) => ({ key, allowed: false }));
		for (const key of PERMISSION_KEYS) {
			expect(resolvePermission("ADMIN", overrides, key)).toBe(true);
		}
	});

	it("resolves the complete set for a membership", () => {
		const resolved = resolvePermissions("USER", [
			{ key: "device.configure", allowed: true },
			{ key: "not.a.permission", allowed: true },
		]);

		expect(resolved).toEqual({
			"incident.acknowledge": false,
			"incident.resolve": true,
			"device.configure": true,
			"members.manage": false,
		});
		expect(Object.keys(resolved).sort()).toEqual([...PERMISSION_KEYS].sort());
	});

	it("resolves each membership from its own rows only", () => {
		// The caller passes the overrides loaded for one membership; rows that
		// belong to another membership (or another organization) are never in
		// this list. This is the pure half of the isolation; the RLS test
		// proves the database half.
		const membershipA = resolvePermissions("RESPONDER", [
			{ key: "device.configure", allowed: true },
		]);
		const membershipB = resolvePermissions("RESPONDER", []);

		expect(membershipA["device.configure"]).toBe(true);
		expect(membershipB["device.configure"]).toBe(false);
	});
});
