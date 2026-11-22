import { BULK_APPROVE_MAX } from "./limits";

export { BULK_APPROVE_MAX } from "./limits";

export const DEVICE_ID_MAX_LENGTH = 64;

export interface BulkDeviceSelection {
	ids: string[];
	overflow: boolean;
	ignored: number;
}

/**
 * Validate the checkbox payload from a bulk form. IDs are trimmed and
 * deduplicated; empty, oversized and repeated values are ignored. More than
 * `BULK_APPROVE_MAX` unique IDs sets `overflow` so the caller can refuse the
 * whole request instead of silently approving an arbitrary prefix.
 */
export function parseBulkDeviceIds(values: readonly string[]): BulkDeviceSelection {
	const ids: string[] = [];
	const seen = new Set<string>();
	let ignored = 0;
	let overflow = false;

	for (const value of values) {
		const id = value.trim();
		if (!id || id.length > DEVICE_ID_MAX_LENGTH) {
			ignored += 1;
			continue;
		}
		if (seen.has(id)) {
			ignored += 1;
			continue;
		}
		if (ids.length >= BULK_APPROVE_MAX) {
			overflow = true;
			continue;
		}
		seen.add(id);
		ids.push(id);
	}

	return { ids, overflow, ignored };
}
