/**
 * Pure helpers for the vehicle detail page: tab routing and the maintenance
 * status transitions. No database or translation imports so both can be tested
 * without a server.
 */

export const VEHICLE_TABS = ["overview", "trips", "incidents", "settings"] as const;
export type VehicleTab = (typeof VEHICLE_TABS)[number];
export const DEFAULT_VEHICLE_TAB: VehicleTab = "overview";

type QueryValue = string | string[] | undefined;

function first(value: QueryValue): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

/** Unknown or missing tabs fall back to overview so a stale link still renders. */
export function parseVehicleTab(value: QueryValue): VehicleTab {
	const requested = first(value);
	return (VEHICLE_TABS as readonly string[]).includes(requested)
		? (requested as VehicleTab)
		: DEFAULT_VEHICLE_TAB;
}

/** Keep tab URLs shareable and omit the default tab. */
export function buildVehicleHref(vehicleId: string, tab: VehicleTab): string {
	return tab === DEFAULT_VEHICLE_TAB
		? `/vehicles/${vehicleId}`
		: `/vehicles/${vehicleId}?tab=${tab}`;
}

export type MaintenanceAction = "enable" | "disable";
export type MaintenanceStatus = "ACTIVE" | "MAINTENANCE";

/** The only action offered for a status; retired and unknown statuses offer none. */
export function maintenanceActionFor(status: string): MaintenanceAction | null {
	if (status === "ACTIVE") return "enable";
	if (status === "MAINTENANCE") return "disable";
	return null;
}

/**
 * Maintenance moves only between ACTIVE and MAINTENANCE. RETIRED is out of
 * scope, and an action that would not move the status is rejected rather than
 * silently treated as a no-op.
 */
export function maintenanceTarget(
	status: string,
	action: MaintenanceAction,
): MaintenanceStatus | null {
	if (status === "ACTIVE" && action === "enable") return "MAINTENANCE";
	if (status === "MAINTENANCE" && action === "disable") return "ACTIVE";
	return null;
}
