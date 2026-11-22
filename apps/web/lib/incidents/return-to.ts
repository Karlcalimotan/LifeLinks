/**
 * Where a successful incident transition sends the operator. Shared contract
 * with the incidents workspace: `dashboard` for the acknowledgement form,
 * an in-app `/incidents...` path for the board, and the detail page otherwise.
 */
export function incidentSuccessPath(locale: string, incidentId: string, returnTo: string): string {
	if (returnTo === "dashboard") return `/${locale}/dashboard?updated=acknowledged`;
	if (returnTo.startsWith("/incidents")) {
		const separator = returnTo.includes("?") ? "&" : "?";
		return `/${locale}${returnTo}${separator}updated=1`;
	}
	return `/${locale}/incidents/${incidentId}?updated=1`;
}
