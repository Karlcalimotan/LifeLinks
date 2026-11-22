export type SearchResultType = "page" | "vehicle" | "incident" | "device";

/**
 * The wire shape shared by the endpoint, the palette and the tests. Display
 * copy (type names, "Unassigned") is resolved in the client from messages, so
 * this shape stays locale-independent.
 */
export interface SearchResult {
	type: SearchResultType;
	id: string;
	title: string;
	subtitle: string | null;
	meta: string | null;
	href: string;
	status: string | null;
	timestamp: string | null;
}

export interface VehicleSearchRow {
	id: string;
	plateNo: string;
	driverName: string | null;
	make: string;
	model: string;
}

export interface IncidentSearchRow {
	id: string;
	clientIncidentId: string;
	status: string;
	detectedAt: Date;
	vehicle: { plateNo: string };
}

export interface DeviceSearchRow {
	id: string;
	label: string;
	mac: string;
	approvalStatus: string;
	vehicle: { plateNo: string } | null;
}

export function vehicleSearchResult(row: VehicleSearchRow): SearchResult {
	const model = [row.make, row.model]
		.map((part) => part.trim())
		.filter(Boolean)
		.join(" ");
	return {
		type: "vehicle",
		id: row.id,
		title: row.plateNo,
		subtitle: model || null,
		meta: row.driverName?.trim() || null,
		href: `/vehicles/${row.id}`,
		status: null,
		timestamp: null,
	};
}

export function incidentSearchResult(row: IncidentSearchRow): SearchResult {
	return {
		type: "incident",
		id: row.id,
		title: row.vehicle.plateNo,
		subtitle: `#${row.id}`,
		meta: row.clientIncidentId || null,
		href: `/incidents/${row.id}`,
		status: row.status,
		timestamp: row.detectedAt.toISOString(),
	};
}

export function deviceSearchResult(row: DeviceSearchRow): SearchResult {
	return {
		type: "device",
		id: row.id,
		title: row.label,
		subtitle: row.mac.toUpperCase(),
		meta: row.vehicle?.plateNo ?? null,
		href: `/devices/${row.id}`,
		status: row.approvalStatus,
		timestamp: null,
	};
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function validType(value: unknown): value is SearchResultType {
	return value === "page" || value === "vehicle" || value === "incident" || value === "device";
}

/**
 * Defensive parser for the palette. The endpoint is trusted, but a changed or
 * failed response must not break the shell with a half-shaped row.
 */
export function parseSearchResults(value: unknown): SearchResult[] {
	if (!Array.isArray(value)) return [];
	const parsed: SearchResult[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== "object") continue;
		const row = entry as Record<string, unknown>;
		if (!validType(row.type)) continue;
		if (typeof row.id !== "string" || typeof row.title !== "string") continue;
		if (typeof row.href !== "string" || !row.href.startsWith("/")) continue;
		parsed.push({
			type: row.type,
			id: row.id,
			title: row.title,
			subtitle: text(row.subtitle),
			meta: text(row.meta),
			href: row.href,
			status: text(row.status),
			timestamp: text(row.timestamp),
		});
	}
	return parsed;
}
