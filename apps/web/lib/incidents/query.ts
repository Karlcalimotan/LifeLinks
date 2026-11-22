import type { Prisma } from "@prisma/client";
import type { Severity } from "./severity";

export const INCIDENT_PAGE_SIZE = 25;
export const MAX_PAGE = 10_000;

export const INCIDENT_STATUS_FILTERS = [
	"SUSPECTED",
	"CONFIRMED",
	"ACKNOWLEDGED",
	"RESOLVED",
	"CANCELLED",
	"FALSE_ALARM",
] as const;
export type IncidentStatusFilter = (typeof INCIDENT_STATUS_FILTERS)[number];

export const INCIDENT_SEVERITY_FILTERS = ["critical", "high", "moderate", "low"] as const;

export const INCIDENT_RANGE_FILTERS = ["7", "14", "30", "all"] as const;
export type IncidentRangeFilter = (typeof INCIDENT_RANGE_FILTERS)[number];

export const INCIDENT_SORT_FIELDS = ["detected"] as const;
export type IncidentSortField = (typeof INCIDENT_SORT_FIELDS)[number];

export const INCIDENT_SORT_DIRS = ["asc", "desc"] as const;
export type IncidentSortDir = (typeof INCIDENT_SORT_DIRS)[number];

export interface IncidentsQuery {
	q: string;
	status: IncidentStatusFilter | null;
	severity: Severity | null;
	range: IncidentRangeFilter;
	sort: IncidentSortField;
	dir: IncidentSortDir;
	page: number;
	pageSize: number;
}

type QueryInput = Record<string, string | string[] | undefined>;

const DAY_MS = 86_400_000;

/**
 * Coordinates are floats, so a text search cannot use `contains`. A query that
 * looks like one coordinate, or a `lat, lng` pair, is matched by proximity
 * instead. The tolerance is about 100 m, which is finer than the coordinate
 * precision stored on an incident.
 */
const COORDINATE_TOLERANCE = 0.001;
const SINGLE_NUMBER = /^-?\d{1,3}(?:\.\d+)?$/;
const NUMBER_PAIR = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/;

function first(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
	return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function validLat(value: number): boolean {
	return value >= -90 && value <= 90;
}

function validLng(value: number): boolean {
	return value >= -180 && value <= 180;
}

function near(value: number): { gte: number; lte: number } {
	return { gte: value - COORDINATE_TOLERANCE, lte: value + COORDINATE_TOLERANCE };
}

function coordinateWhere(q: string): Prisma.ImpactEventWhereInput | null {
	const pair = NUMBER_PAIR.exec(q);
	if (pair) {
		const lat = Number(pair[1]);
		const lng = Number(pair[2]);
		if (!validLat(lat) || !validLng(lng)) return null;
		return { AND: [{ lat: near(lat) }, { lng: near(lng) }] };
	}

	if (!SINGLE_NUMBER.test(q) || !q.includes(".")) return null;
	const value = Number(q);
	if (!validLat(value) && !validLng(value)) return null;

	const terms: Prisma.ImpactEventWhereInput[] = [];
	if (validLat(value)) terms.push({ lat: near(value) });
	if (validLng(value)) terms.push({ lng: near(value) });
	return { OR: terms };
}

function searchWhere(q: string): Prisma.ImpactEventWhereInput[] | null {
	if (!q) return null;

	const terms: Prisma.ImpactEventWhereInput[] = [
		{ id: { contains: q, mode: "insensitive" } },
		{ vehicle: { is: { plateNo: { contains: q, mode: "insensitive" } } } },
		{ vehicle: { is: { driverName: { contains: q, mode: "insensitive" } } } },
	];
	const coordinates = coordinateWhere(q);
	if (coordinates) terms.push(coordinates);
	return terms;
}

export function parseIncidentsQuery(input: QueryInput = {}): IncidentsQuery {
	const q = first(input.q).trim().slice(0, 80);
	const status = oneOf(first(input.status).toUpperCase(), INCIDENT_STATUS_FILTERS);
	const severity = oneOf(first(input.severity).toLowerCase(), INCIDENT_SEVERITY_FILTERS);
	const range = oneOf(first(input.range).toLowerCase(), INCIDENT_RANGE_FILTERS) ?? "all";
	const sort = oneOf(first(input.sort).toLowerCase(), INCIDENT_SORT_FIELDS) ?? "detected";
	const dir = oneOf(first(input.dir).toLowerCase(), INCIDENT_SORT_DIRS) ?? "desc";
	const pageRaw = Number.parseInt(first(input.page), 10);
	const page = Number.isFinite(pageRaw) ? Math.min(MAX_PAGE, Math.max(1, pageRaw)) : 1;

	return {
		q,
		status,
		severity,
		range,
		sort,
		dir,
		page,
		pageSize: INCIDENT_PAGE_SIZE,
	};
}

/** The start of the selected date range, or null for all time. */
export function rangeStart(range: IncidentRangeFilter, now = new Date()): Date | null {
	if (range === "all") return null;
	return new Date(now.getTime() - Number(range) * DAY_MS);
}

/**
 * The Prisma mirror of `severityFor`. Severity is derived at render time, so
 * every band is expressed as a filter over the two stored measurements. The
 * boundaries must stay in step with `lib/incidents/severity.ts`.
 */
export function severityWhere(severity: Severity): Prisma.ImpactEventWhereInput {
	switch (severity) {
		case "critical":
			return {
				OR: [{ peakAccelG: { gte: 4 } }, { tiltDeg: { gte: 75 } }],
			};
		case "high":
			return {
				AND: [
					{ OR: [{ peakAccelG: { gte: 3 } }, { tiltDeg: { gte: 60 } }] },
					{ peakAccelG: { lt: 4 } },
					{ tiltDeg: { lt: 75 } },
				],
			};
		case "moderate":
			return {
				AND: [
					{ OR: [{ peakAccelG: { gte: 2.5 } }, { tiltDeg: { gte: 45 } }] },
					{ peakAccelG: { lt: 3 } },
					{ tiltDeg: { lt: 60 } },
				],
			};
		default:
			return { peakAccelG: { lt: 2.5 }, tiltDeg: { lt: 45 } };
	}
}

/**
 * Build the full list filter. `base` carries organization and owner scope;
 * status is optional so the status chips can count the other filters without
 * counting themselves.
 */
export function incidentWhere(
	base: Prisma.ImpactEventWhereInput,
	query: IncidentsQuery,
	now = new Date(),
): Prisma.ImpactEventWhereInput {
	const where: Prisma.ImpactEventWhereInput = { ...base };
	const and: Prisma.ImpactEventWhereInput[] = [];

	if (query.status) where.status = query.status;

	if (query.severity) and.push(severityWhere(query.severity));
	const since = rangeStart(query.range, now);
	if (since) and.push({ detectedAt: { gte: since } });

	const search = searchWhere(query.q);
	if (search) where.OR = search;

	if (and.length > 0) where.AND = and;
	return where;
}

export function incidentOrderBy(
	query: IncidentsQuery,
): Prisma.ImpactEventOrderByWithRelationInput[] {
	return [{ detectedAt: query.dir }, { id: "asc" }];
}

export function hasActiveFilters(query: IncidentsQuery): boolean {
	return Boolean(query.q || query.status || query.severity || query.range !== "all");
}

/**
 * Build an incidents URL from the current query plus overrides. Defaults are
 * omitted so the URL stays short and shareable.
 */
export function buildIncidentsHref(
	query: IncidentsQuery,
	overrides: Partial<IncidentsQuery> = {},
): string {
	const next = { ...query, ...overrides };
	const params = new URLSearchParams();
	if (next.q) params.set("q", next.q);
	if (next.status) params.set("status", next.status);
	if (next.severity) params.set("severity", next.severity);
	if (next.range !== "all") params.set("range", next.range);
	if (next.sort !== "detected") params.set("sort", next.sort);
	if (next.dir !== "desc") params.set("dir", next.dir);
	if (next.page > 1) params.set("page", String(next.page));

	const search = params.toString();
	return search ? `/incidents?${search}` : "/incidents";
}
