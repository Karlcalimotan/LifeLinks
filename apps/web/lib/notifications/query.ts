import type { AlertChannel, AlertStatus, Prisma } from "@prisma/client";

export const NOTIFICATION_PAGE_SIZE = 25;
export const NOTIFICATION_MAX_PAGE = 10_000;

export const ALERT_STATUS_FILTERS = [
	"QUEUED",
	"SENT",
	"FAILED",
	"ACKNOWLEDGED",
] as const satisfies readonly AlertStatus[];

export const ALERT_CHANNEL_FILTERS = [
	"SMS",
	"EMAIL",
	"HTTP",
] as const satisfies readonly AlertChannel[];

export interface NotificationsQuery {
	status: AlertStatus | null;
	channel: AlertChannel | null;
	page: number;
	pageSize: number;
}

export interface Pagination {
	page: number;
	pageCount: number;
	skip: number;
	from: number;
	to: number;
}

type QueryInput = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
	return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseNotificationsQuery(input: QueryInput = {}): NotificationsQuery {
	const status = oneOf(first(input.status).toUpperCase(), ALERT_STATUS_FILTERS);
	const channel = oneOf(first(input.channel).toUpperCase(), ALERT_CHANNEL_FILTERS);
	const pageRaw = Number.parseInt(first(input.page), 10);
	const page = Number.isFinite(pageRaw) ? Math.min(NOTIFICATION_MAX_PAGE, Math.max(1, pageRaw)) : 1;

	return { status, channel, page, pageSize: NOTIFICATION_PAGE_SIZE };
}

/** Scope the log through the incident, because AlertDelivery has no orgId. */
export function notificationsWhere(
	orgId: string,
	query: NotificationsQuery,
): Prisma.AlertDeliveryWhereInput {
	const where: Prisma.AlertDeliveryWhereInput = { impact: { orgId } };
	if (query.status) where.status = query.status;
	if (query.channel) where.channel = query.channel;
	return where;
}

export function clampPagination(
	total: number,
	page: number,
	pageSize = NOTIFICATION_PAGE_SIZE,
): Pagination {
	const safeTotal = Math.max(0, total);
	const pageCount = Math.max(1, Math.ceil(safeTotal / pageSize));
	const clamped = Math.min(Math.max(1, page), pageCount);
	const from = safeTotal === 0 ? 0 : (clamped - 1) * pageSize + 1;
	const to = Math.min(clamped * pageSize, safeTotal);
	return { page: clamped, pageCount, skip: (clamped - 1) * pageSize, from, to };
}

export function hasActiveFilters(query: NotificationsQuery): boolean {
	return Boolean(query.status || query.channel);
}

/**
 * Build a notifications URL from the current query plus overrides. Defaults are
 * omitted so the URL stays short and shareable.
 */
export function buildNotificationsHref(
	query: NotificationsQuery,
	overrides: Partial<NotificationsQuery> = {},
): string {
	const next = { ...query, ...overrides };
	const params = new URLSearchParams();
	if (next.status) params.set("status", next.status);
	if (next.channel) params.set("channel", next.channel);
	if (next.page > 1) params.set("page", String(next.page));

	const search = params.toString();
	return search ? `/notifications?${search}` : "/notifications";
}
