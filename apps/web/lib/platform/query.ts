import type { Prisma } from "@prisma/client";

export const PLATFORM_PAGE_SIZE = 25;

export type PlatformStatusFilter = "all" | "active" | "suspended";

export interface PlatformQuery {
	q: string;
	status: PlatformStatusFilter;
	page: number;
}

type QueryValue = string | string[] | undefined;
type QueryInput = Record<string, QueryValue>;

function first(value: QueryValue): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

export function parsePlatformQuery(input: QueryInput = {}): PlatformQuery {
	const status = first(input.status);
	const parsedStatus: PlatformStatusFilter =
		status === "active" || status === "suspended" ? status : "all";
	const parsedPage = Number.parseInt(first(input.page), 10);
	return {
		q: first(input.q).trim().slice(0, 100),
		status: parsedStatus,
		page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
	};
}

export function platformOrgWhere(query: PlatformQuery): Prisma.OrganizationWhereInput {
	const where: Prisma.OrganizationWhereInput = {};
	if (query.status === "active") where.status = "ACTIVE";
	if (query.status === "suspended") where.status = "SUSPENDED";
	if (query.q) {
		where.OR = [
			{ name: { contains: query.q, mode: "insensitive" } },
			{ slug: { contains: query.q, mode: "insensitive" } },
		];
	}
	return where;
}

export function hasPlatformFilters(query: PlatformQuery): boolean {
	return query.q.length > 0 || query.status !== "all";
}

export interface PlatformPage {
	page: number;
	pageCount: number;
	skip: number;
	take: number;
}

/** Clamp a requested page to the rows that exist, never to a negative offset. */
export function clampPlatformPage(page: number, total: number): PlatformPage {
	const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
	const pageCount = Math.max(1, Math.ceil(safeTotal / PLATFORM_PAGE_SIZE));
	const requested = Number.isFinite(page) ? Math.floor(page) : 1;
	const clamped = Math.min(Math.max(1, requested), pageCount);
	return {
		page: clamped,
		pageCount,
		skip: (clamped - 1) * PLATFORM_PAGE_SIZE,
		take: PLATFORM_PAGE_SIZE,
	};
}

/** Keep filter URLs shareable and omit defaults. */
export function buildPlatformHref(query: PlatformQuery, options: { page?: number } = {}): string {
	const params = new URLSearchParams();
	if (query.q) params.set("q", query.q);
	if (query.status !== "all") params.set("status", query.status);
	if (options.page != null && options.page > 1) params.set("page", String(options.page));
	const search = params.toString();
	return search ? `/platform?${search}` : "/platform";
}
