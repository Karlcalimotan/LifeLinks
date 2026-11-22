export type PageKey =
	| "dashboard"
	| "map"
	| "vehicles"
	| "incidents"
	| "analytics"
	| "notifications"
	| "devices"
	| "settings";

export interface PageDefinition {
	key: PageKey;
	href: string;
	adminOnly: boolean;
	hiddenForUser?: boolean;
	keywords: readonly string[];
}

/** Static destinations in the shell. Labels come from the existing nav copy. */
export const SEARCH_PAGES: readonly PageDefinition[] = [
	{
		key: "dashboard",
		href: "/dashboard",
		adminOnly: false,
		keywords: ["overview", "home", "fleet", "kpi"],
	},
	{
		key: "map",
		href: "/map",
		adminOnly: false,
		keywords: ["live", "positions", "fleet", "gps"],
	},
	{
		key: "vehicles",
		href: "/vehicles",
		adminOnly: false,
		keywords: ["cars", "plate", "fleet"],
	},
	{
		key: "incidents",
		href: "/incidents",
		adminOnly: false,
		keywords: ["alerts", "crashes", "response"],
	},
	{
		key: "analytics",
		href: "/analytics",
		adminOnly: false,
		keywords: ["charts", "reports", "response", "trends"],
	},
	{
		key: "notifications",
		href: "/notifications",
		adminOnly: false,
		hiddenForUser: true,
		keywords: ["alerts", "delivery", "contacts", "sms"],
	},
	{
		key: "devices",
		href: "/devices",
		adminOnly: true,
		keywords: ["trackers", "mac", "battery", "gps"],
	},
	{
		key: "settings",
		href: "/settings",
		adminOnly: true,
		keywords: ["config", "organisation", "members"],
	},
];

export interface PageCandidate extends PageDefinition {
	label: string;
}

export interface PageAccess {
	canAdminister: boolean;
	isUser: boolean;
}

export function visiblePages(
	pages: readonly PageDefinition[],
	access: PageAccess,
): PageDefinition[] {
	return pages.filter((page) => {
		if (page.adminOnly && !access.canAdminister) return false;
		if (page.hiddenForUser && access.isUser) return false;
		return true;
	});
}

/** An empty query shows every visible page; a typed query matches label or keyword. */
export function matchPages(candidates: readonly PageCandidate[], query: string): PageCandidate[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [...candidates];
	return candidates.filter((page) => {
		if (page.label.toLowerCase().includes(needle)) return true;
		if (page.key.includes(needle)) return true;
		return page.keywords.some((keyword) => keyword.includes(needle));
	});
}
