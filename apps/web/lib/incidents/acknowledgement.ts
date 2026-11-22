const CLOSED_STATUSES = new Set(["ACKNOWLEDGED", "RESOLVED", "CANCELLED", "FALSE_ALARM"]);

/** Compact durations for a dense table: 45s, 9m 30s, 3h 12m, 2d 4h. */
export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	if (totalSeconds < 60) return `${totalSeconds}s`;

	const totalMinutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;

	const totalHours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (totalHours < 24) return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;

	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * Time to acknowledge is not a stored column. The acknowledge action writes an
 * `incident.acknowledged` audit row, so the page passes the earliest such
 * timestamp. A closed incident without that row has no acknowledgement to
 * measure and shows an em dash; an open incident shows elapsed time.
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
