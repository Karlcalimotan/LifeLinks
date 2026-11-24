/**
 * Retention cleanup arithmetic and bounded-batch limits.
 *
 * The cleanup job deletes at most `RETENTION_BATCH_SIZE` rows per query and
 * stops after `RETENTION_MAX_BATCHES` per organisation and table. A single cron
 * invocation therefore can never run an unbounded full-table delete; whatever
 * is left is picked up by the next daily run.
 *
 * The settings form limits a retention period to 1..3650 days. This module
 * still treats a non-positive or non-finite stored value as "do not delete",
 * so corrupt data cannot move the cutoff to now and wipe recent rows.
 */
export const RETENTION_BATCH_SIZE = 5_000;
export const RETENTION_MAX_BATCHES = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(now: Date, days: number): Date | null {
	if (!Number.isFinite(days) || days < 1) return null;
	return new Date(now.getTime() - Math.floor(days) * DAY_MS);
}
