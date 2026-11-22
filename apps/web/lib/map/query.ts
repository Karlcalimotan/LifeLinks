/**
 * URL state for the live map. Search, filter and selection all live in the
 * query string so the screen can be linked, refreshed and restored with the
 * browser's back button.
 */

export const MAP_FILTERS = ["all", "online", "offline", "low-battery", "incident"] as const;

export type MapFilter = (typeof MAP_FILTERS)[number];

export interface MapQuery {
	q: string;
	filter: MapFilter;
	vehicle: string | null;
}

type QueryInput = Record<string, string | string[] | undefined>;

const MAX_QUERY_LENGTH = 80;
/** cuids and prefixed ids are alphanumeric; anything else is not ours. */
const VEHICLE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function first(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

export function parseMapQuery(input: QueryInput = {}): MapQuery {
	const q = first(input.q).trim().slice(0, MAX_QUERY_LENGTH);
	const filterRaw = first(input.filter).trim().toLowerCase();
	const filter = (MAP_FILTERS as readonly string[]).includes(filterRaw)
		? (filterRaw as MapFilter)
		: "all";
	const vehicleRaw = first(input.vehicle).trim();
	const vehicle = VEHICLE_ID.test(vehicleRaw) ? vehicleRaw : null;

	return { q, filter, vehicle };
}

/** Defaults are omitted so a clean map has a clean URL. */
export function buildMapHref(query: MapQuery, overrides: Partial<MapQuery> = {}): string {
	const next = { ...query, ...overrides };
	const params = new URLSearchParams();
	if (next.q) params.set("q", next.q);
	if (next.filter !== "all") params.set("filter", next.filter);
	if (next.vehicle) params.set("vehicle", next.vehicle);
	const search = params.toString();
	return search ? `/map?${search}` : "/map";
}

export function hasActiveMapFilters(query: MapQuery): boolean {
	return Boolean(query.q) || query.filter !== "all" || query.vehicle !== null;
}
