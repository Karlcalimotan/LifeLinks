import { formatDuration } from "@/lib/analytics/aggregate";

const CLOSED_STATUSES = new Set(["ACKNOWLEDGED", "RESOLVED", "CANCELLED", "FALSE_ALARM"]);

/**
 * Time to acknowledge is not a stored column. The acknowledge action writes an
 * `incident.acknowledged` audit row, so the page passes the earliest such
 * timestamp. A closed incident without that row has no acknowledgement to
 * measure and shows an em dash; an open incident shows elapsed time.
 *
 * The duration format is shared with analytics (`lib/analytics/aggregate.ts`)
 * so the two screens cannot drift.
 */
export function acknowledgementDuration({
	status,
	detectedAt,
	acknowledgedAt,
	now = new Date(),
}: {
	status: string;
	detectedAt: Date;
	acknowledgedAt: Date | null;
	now?: Date;
}): string {
	if (CLOSED_STATUSES.has(status)) {
		if (!acknowledgedAt) return "—";
		return formatDuration(acknowledgedAt.getTime() - detectedAt.getTime());
	}
	return formatDuration(now.getTime() - detectedAt.getTime());
}
