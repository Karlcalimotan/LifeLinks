import { type MemberRoleName, canAdminister, canManageIncidents } from "@/lib/auth/roles";

export const SETTINGS_TABS = [
	"organization",
	"thresholds",
	"retention",
	"members",
	"audit",
	"health",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "organization";

const FORM_TABS = ["organization", "thresholds", "retention"] as const;

export const AUDIT_PAGE_SIZE = 20;
const AUDIT_ACTION_MAX = 80;

type QueryValue = string | string[] | undefined;
type QueryInput = Record<string, QueryValue>;

function first(value: QueryValue): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
	return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Unknown or missing tabs fall back to the first section so the page always renders. */
export function parseSettingsTab(value: QueryValue): SettingsTab {
	return oneOf(first(value), SETTINGS_TABS) ?? DEFAULT_SETTINGS_TAB;
}

export function isSettingsFormTab(tab: SettingsTab): boolean {
	return (FORM_TABS as readonly string[]).includes(tab);
}

export interface AuditQuery {
	action: string;
	page: number;
}

/** The audit filter is a plain GET form, so every value arrives as a string. */
export function parseAuditQuery(input: QueryInput = {}): AuditQuery {
	const action = first(input.action).trim().slice(0, AUDIT_ACTION_MAX);
	const parsed = Number.parseInt(first(input.page), 10);
	return {
		action,
		page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
	};
}

export interface AuditPage {
	page: number;
	pageCount: number;
	skip: number;
	take: number;
}

/** Clamp a requested page to the rows that exist, never to a negative offset. */
export function clampAuditPage(page: number, total: number): AuditPage {
	const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
	const pageCount = Math.max(1, Math.ceil(safeTotal / AUDIT_PAGE_SIZE));
	const requested = Number.isFinite(page) ? Math.floor(page) : 1;
	const clamped = Math.min(Math.max(1, requested), pageCount);
	return {
		page: clamped,
		pageCount,
		skip: (clamped - 1) * AUDIT_PAGE_SIZE,
		take: AUDIT_PAGE_SIZE,
	};
}

export interface SettingsHrefOptions {
	action?: string;
	page?: number;
}

/** Keep tab URLs shareable and omit defaults. */
export function buildSettingsHref(tab: SettingsTab, options: SettingsHrefOptions = {}): string {
	const params = new URLSearchParams();
	if (tab !== DEFAULT_SETTINGS_TAB) params.set("tab", tab);
	if (tab === "audit") {
		const action = options.action?.trim();
		if (action) params.set("action", action);
		if (options.page != null && options.page > 1) params.set("page", String(options.page));
	}
	const search = params.toString();
	return search ? `/settings?${search}` : "/settings";
}

export const PERMISSION_ROLE_ORDER: readonly MemberRoleName[] = ["ADMIN", "RESPONDER", "USER"];

export type PermissionKey = "incidents" | "administration";

export interface PermissionRow {
	key: PermissionKey;
	roles: Record<MemberRoleName, boolean>;
}

function grants(check: (role: MemberRoleName) => boolean): Record<MemberRoleName, boolean> {
	return {
		USER: check("USER"),
		RESPONDER: check("RESPONDER"),
		ADMIN: check("ADMIN"),
	};
}

/**
 * The matrix is generated from the helpers that the server actually enforces,
 * so it cannot drift from the real permission checks.
 */
export function permissionMatrix(): PermissionRow[] {
	return [
		{ key: "incidents", roles: grants(canManageIncidents) },
		{ key: "administration", roles: grants(canAdminister) },
	];
}
