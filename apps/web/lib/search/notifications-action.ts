"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { loadAwaitingIncidents } from "./notifications";

/**
 * Read-only refresh for the header bell. The session is resolved again here;
 * the client never supplies an org, role or user id.
 */
export async function refreshAwaitingIncidents() {
	const current = await getCurrentUser();
	if (!current) return { ok: false as const, error: "unauthorized" as const };

	try {
		const data = await loadAwaitingIncidents({
			role: current.role,
			orgId: current.org.id,
			userId: current.user.id,
		});
		return { ok: true as const, data };
	} catch (error) {
		if (process.env.NODE_ENV !== "test") {
			console.error("[search] notification refresh failed", error);
		}
		return { ok: false as const, error: "failed" as const };
	}
}
