import "server-only";

/**
 * Local demonstration accounts created by the demo seed. These values live
 * here, not in the message catalogs, so a production build does not ship them
 * in the client bundle or the RSC payload. The login panel that displays them
 * is rendered only when DEMO_MODE is exactly "true".
 */
export const DEMO_ACCOUNTS = [
	{ role: "Admin", email: "admin@lifelink.local", password: "Admin123!" },
	{ role: "Vehicle owner", email: "owner@lifelink.local", password: "Owner123!" },
	{ role: "Responder", email: "responder@lifelink.local", password: "Responder123!" },
] as const;

export function demoModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
	return env.DEMO_MODE === "true" && (env.NODE_ENV === "development" || env.NODE_ENV === "test");
}
