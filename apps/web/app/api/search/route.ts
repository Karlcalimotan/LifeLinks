import { unauthorized } from "@/lib/api/errors";
import { jsonOk, withApi } from "@/lib/api/instrumentation";
import { getCurrentUser } from "@/lib/auth/session";
import { parseSearchQuery } from "@/lib/search/query";
import { searchOrg } from "@/lib/search/search";

export const dynamic = "force-dynamic";

/**
 * Application search for the command palette. Session-authenticated, scoped to
 * the membership's organisation and owner role, and capped before querying.
 */
export const GET = withApi(
	async (request) => {
		const current = await getCurrentUser();
		if (!current) throw unauthorized("Sign in to search.");

		const query = parseSearchQuery(new URL(request.url).searchParams.get("q"));
		if (!query) return jsonOk({ query: "", results: [] });

		const results = await searchOrg(
			{ role: current.role, orgId: current.org.id, userId: current.user.id },
			query,
		);
		return jsonOk({ query, results });
	},
	{ route: "search" },
);
