export const SEARCH_QUERY_MAX = 80;
export const SEARCH_RESULT_LIMIT = 8;

/** Trim, collapse whitespace and cap the query before it reaches the database. */
export function parseSearchQuery(value: string | null | undefined): string {
	if (typeof value !== "string") return "";
	return value.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX);
}

export function normaliseForMatch(value: string | null | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

/** 3 exact, 2 prefix, 1 contains, 0 no match. */
export function matchScore(value: string | null | undefined, query: string): number {
	const haystack = normaliseForMatch(value);
	const needle = normaliseForMatch(query);
	if (!haystack || !needle) return 0;
	if (haystack === needle) return 3;
	if (haystack.startsWith(needle)) return 2;
	return haystack.includes(needle) ? 1 : 0;
}

const TYPE_ORDER: Record<string, number> = {
	page: 0,
	vehicle: 1,
	incident: 2,
	device: 3,
};

export interface RankableResult {
	type: string;
	id: string;
	title: string;
	subtitle: string | null;
	meta: string | null;
}

export function resultScore(result: RankableResult, query: string): number {
	return Math.max(
		matchScore(result.title, query),
		matchScore(result.subtitle, query),
		matchScore(result.meta, query),
		matchScore(result.id, query),
	);
}

/**
 * Best match first, then page > vehicle > incident > tracker, then title.
 * Deterministic so the same query always produces the same order.
 */
export function rankSearchResults<T extends RankableResult>(
	results: readonly T[],
	query: string,
	limit = SEARCH_RESULT_LIMIT,
): T[] {
	return [...results]
		.sort((a, b) => {
			const score = resultScore(b, query) - resultScore(a, query);
			if (score !== 0) return score;
			const type = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
			if (type !== 0) return type;
			const title = a.title.localeCompare(b.title);
			if (title !== 0) return title;
			return a.id.localeCompare(b.id);
		})
		.slice(0, limit);
}
