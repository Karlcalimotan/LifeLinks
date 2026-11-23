function incidentReturnBase(locale: string, incidentId: string, returnTo: string): string {
	if (returnTo === "dashboard") return `/${locale}/dashboard`;
	if (returnTo.startsWith("/incidents")) return `/${locale}${returnTo}`;
	return `/${locale}/incidents/${incidentId}`;
}

function appendQuery(path: string, key: string, value: string): string {
	const separator = path.includes("?") ? "&" : "?";
	return `${path}${separator}${key}=${value}`;
}

/**
 * Where a successful incident transition sends the operator. Shared contract
 * with the incidents workspace: `dashboard` for the acknowledgement form,
 * an in-app `/incidents...` path for the board, and the detail page otherwise.
 */
export function incidentSuccessPath(locale: string, incidentId: string, returnTo: string): string {
	if (returnTo === "dashboard") return `/${locale}/dashboard?updated=acknowledged`;
	return appendQuery(incidentReturnBase(locale, incidentId, returnTo), "updated", "1");
}

/**
 * Where a queued stand-down request sends the operator. The incident has not
 * changed yet, so the page must not claim it was updated.
 */
export function incidentCancelRequestPath(
	locale: string,
	incidentId: string,
	returnTo: string,
): string {
	return appendQuery(incidentReturnBase(locale, incidentId, returnTo), "cancel", "requested");
}
