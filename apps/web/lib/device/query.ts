import { DEVICE_OFFLINE_AFTER_MIN, DEVICE_WEAK_AFTER_MIN } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

export const DEVICE_PAGE_SIZE = 20;
export const LOW_BATTERY_V = 3.6;

export const APPROVAL_FILTERS = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalFilter = (typeof APPROVAL_FILTERS)[number];

export const CONNECTION_FILTERS = ["online", "weak", "offline", "never"] as const;
export type ConnectionFilter = (typeof CONNECTION_FILTERS)[number];

export const ASSIGNED_FILTERS = ["yes", "no"] as const;
export type AssignedFilter = (typeof ASSIGNED_FILTERS)[number];

export const BATTERY_FILTERS = ["low"] as const;
export type BatteryFilter = (typeof BATTERY_FILTERS)[number];

export const SORT_FIELDS = ["label", "mac", "approval", "lastSeen", "battery"] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

export interface DevicesQuery {
	q: string;
	approval: ApprovalFilter | null;
	connection: ConnectionFilter | null;
	assigned: AssignedFilter | null;
	battery: BatteryFilter | null;
	sort: SortField;
	dir: SortDir;
	page: number;
	pageSize: number;
}

type QueryInput = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
	return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseDevicesQuery(input: QueryInput = {}): DevicesQuery {
	const q = first(input.q).trim().slice(0, 80);
	const approval = oneOf(first(input.approval).toUpperCase(), APPROVAL_FILTERS);
	const connection = oneOf(first(input.connection).toLowerCase(), CONNECTION_FILTERS);
	const assigned = oneOf(first(input.assigned).toLowerCase(), ASSIGNED_FILTERS);
	const battery = oneOf(first(input.battery).toLowerCase(), BATTERY_FILTERS);
	const sort = oneOf(first(input.sort), SORT_FIELDS) ?? "lastSeen";
	const dir = oneOf(first(input.dir).toLowerCase(), SORT_DIRS) ?? "desc";
	const pageRaw = Number.parseInt(first(input.page), 10);
	const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

	return {
		q,
		approval,
		connection,
		assigned,
		battery,
		sort,
		dir,
		page,
		pageSize: DEVICE_PAGE_SIZE,
	};
}

const MINUTE_MS = 60_000;

/**
 * Build the Prisma filter for the tracker list. `now` is injectable so the
 * connection cutoffs can be tested without freezing the clock.
 */
export function deviceWhere(
	orgId: string,
	query: DevicesQuery,
	now = new Date(),
): Prisma.TrackerDeviceWhereInput {
	const where: Prisma.TrackerDeviceWhereInput = { orgId };

	if (query.q) {
		const q = query.q;
		where.OR = [
			{ label: { contains: q, mode: "insensitive" } },
			{ mac: { contains: q.toUpperCase() } },
			{ vehicle: { plateNo: { contains: q, mode: "insensitive" } } },
		];
	}

	if (query.approval) where.approvalStatus = query.approval;
	if (query.assigned === "yes") where.vehicleId = { not: null };
	if (query.assigned === "no") where.vehicleId = null;

	if (query.connection === "never") {
		where.lastSeenAt = null;
	} else if (query.connection) {
		const weakCutoff = new Date(now.getTime() - DEVICE_WEAK_AFTER_MIN * MINUTE_MS);
		const offlineCutoff = new Date(now.getTime() - DEVICE_OFFLINE_AFTER_MIN * MINUTE_MS);
		if (query.connection === "online") where.lastSeenAt = { gte: weakCutoff };
		if (query.connection === "weak") {
			where.lastSeenAt = { lt: weakCutoff, gte: offlineCutoff };
		}
		if (query.connection === "offline") where.lastSeenAt = { lt: offlineCutoff };
	}

	if (query.battery === "low") where.batteryV = { lt: LOW_BATTERY_V };

	return where;
}

export function deviceOrderBy(query: DevicesQuery): Prisma.TrackerDeviceOrderByWithRelationInput[] {
	const dir = query.dir;
	const field: Record<SortField, Prisma.TrackerDeviceOrderByWithRelationInput> = {
		label: { label: dir },
		mac: { mac: dir },
		approval: { approvalStatus: dir },
		lastSeen: { lastSeenAt: { sort: dir, nulls: "last" } },
		battery: { batteryV: { sort: dir, nulls: "last" } },
	};

	return [field[query.sort], { id: "asc" }];
}

export function hasActiveFilters(query: DevicesQuery): boolean {
	return Boolean(query.q || query.approval || query.connection || query.assigned || query.battery);
}

/**
 * Build a tracker-list URL from the current query plus overrides. Defaults are
 * omitted so the URL stays short and shareable.
 */
export function buildDevicesHref(
	query: DevicesQuery,
	overrides: Partial<DevicesQuery> = {},
): string {
	const next = { ...query, ...overrides };
	const params = new URLSearchParams();
	if (next.q) params.set("q", next.q);
	if (next.approval) params.set("approval", next.approval);
	if (next.connection) params.set("connection", next.connection);
	if (next.assigned) params.set("assigned", next.assigned);
	if (next.battery) params.set("battery", next.battery);
	if (next.sort !== "lastSeen") params.set("sort", next.sort);
	if (next.dir !== "desc") params.set("dir", next.dir);
	if (next.page > 1) params.set("page", String(next.page));

	const search = params.toString();
	return search ? `/devices?${search}` : "/devices";
}
