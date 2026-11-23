/**
 * The permission overlay.
 *
 * Role defaults are the baseline; a `MembershipPermission` row overrides one
 * key for one membership. `resolvePermission` is the only place the two are
 * combined, so the session, the server actions and the tests cannot drift
 * apart.
 *
 * ADMIN is never downgraded. The overlay can grant a USER or RESPONDER an
 * extra capability and can take one away; it cannot remove an admin's ability
 * to administer, which would otherwise lock the last admin out of the console.
 * The requirement is "keep ADMIN always able to administer", so an admin
 * override of `false` is ignored rather than persisted as a trap.
 *
 * This module is deliberately free of server-only imports so it can be
 * unit-tested.
 */
import type { MemberRoleName } from "./roles";

export const PERMISSION_KEYS = [
	"incident.acknowledge",
	"incident.resolve",
	"device.configure",
	"members.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** A row as it comes back from `MembershipPermission`. */
export interface PermissionOverride {
	key: string;
	allowed: boolean;
}

export type PermissionOverrides = readonly PermissionOverride[];

export type PermissionSet = Record<PermissionKey, boolean>;

const ROLE_DEFAULTS: Record<MemberRoleName, PermissionSet> = {
	// A vehicle owner works the incidents on their own vehicles, including a
	// local resolve, but bureau acknowledgement is a tracker command and stays
	// with RESPONDER/ADMIN (#105). That scope is enforced separately in the
	// incident actions.
	USER: {
		"incident.acknowledge": false,
		"incident.resolve": true,
		"device.configure": false,
		"members.manage": false,
	},
	RESPONDER: {
		"incident.acknowledge": true,
		"incident.resolve": true,
		"device.configure": false,
		"members.manage": false,
	},
	ADMIN: {
		"incident.acknowledge": true,
		"incident.resolve": true,
		"device.configure": true,
		"members.manage": true,
	},
};

export function isPermissionKey(value: unknown): value is PermissionKey {
	return typeof value === "string" && (PERMISSION_KEYS as readonly string[]).includes(value);
}

/** A fresh copy, so a caller cannot mutate the table the resolver reads. */
export function rolePermissionDefaults(role: MemberRoleName): PermissionSet {
	return { ...ROLE_DEFAULTS[role] };
}

/**
 * Explicit override ?? role default. Unknown keys in the override list are
 * ignored: a row written by an older or newer release never grants a
 * capability this build does not know about.
 */
export function resolvePermission(
	role: MemberRoleName,
	overrides: PermissionOverrides,
	key: PermissionKey,
): boolean {
	if (role === "ADMIN") return true;
	const override = overrides.find((entry) => entry.key === key);
	if (override) return override.allowed;
	return ROLE_DEFAULTS[role][key];
}

/** The full resolved set, used once per request in `getCurrentUser`. */
export function resolvePermissions(
	role: MemberRoleName,
	overrides: PermissionOverrides,
): PermissionSet {
	const resolved = {} as PermissionSet;
	for (const key of PERMISSION_KEYS) {
		resolved[key] = resolvePermission(role, overrides, key);
	}
	return resolved;
}

/** Drop unknown keys before they reach a resolver or an audit row. */
export function knownOverrides(overrides: PermissionOverrides): PermissionOverride[] {
	return overrides.filter((entry) => isPermissionKey(entry.key));
}
