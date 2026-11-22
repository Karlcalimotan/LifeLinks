/**
 * Route to message lookup for the browser tab title. The root layout keeps the
 * full `%s | LifeLink` template, so these are the short page names.
 */
export const PAGE_TITLES = {
	dashboard: { namespace: "dashboard", key: "title" },
	incidents: { namespace: "incidents", key: "title" },
	vehicles: { namespace: "vehicles", key: "title" },
	devices: { namespace: "devices", key: "title" },
	analytics: { namespace: "analytics", key: "title" },
	map: { namespace: "map", key: "title" },
	notifications: { namespace: "notifications", key: "title" },
	settings: { namespace: "settings", key: "title" },
} as const;

export type PageTitleRoute = keyof typeof PAGE_TITLES;
