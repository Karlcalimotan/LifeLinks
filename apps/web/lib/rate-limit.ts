/**
 * Small in-process rate limiter for login, search and device routes.
 *
 * This is deliberately simple: a fixed window per key. It is honest about its
 * scope — it does not coordinate across server instances, so a multi-instance
 * deployment should replace it with a shared store (Postgres or Redis). For a
 * single-node capstone deployment it closes the obvious brute-force door.
 *
 * The map is bounded so an attacker cannot grow it without limit by sending a
 * new key on every request. Expired buckets are swept periodically; when the
 * map is full the oldest inserted bucket is evicted. Eviction can let that key
 * retry early, which is the deliberate trade-off for bounded memory.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Maximum number of live keys retained in this process. */
export const RATE_LIMIT_MAX_BUCKETS = 5_000;

/** Expired keys are swept at most this often on the hot path. */
export const RATE_LIMIT_PRUNE_INTERVAL_MS = 60_000;

let lastPrunedAt = 0;

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

export function pruneExpiredRateLimits(now = Date.now()): number {
	let removed = 0;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) {
			buckets.delete(key);
			removed += 1;
		}
	}
	lastPrunedAt = now;
	return removed;
}

function maybePrune(now: number): void {
	if (now - lastPrunedAt >= RATE_LIMIT_PRUNE_INTERVAL_MS) {
		pruneExpiredRateLimits(now);
	}
}

function ensureCapacity(now: number): void {
	if (buckets.size < RATE_LIMIT_MAX_BUCKETS) return;

	// Do not scan the whole map on every request during a key flood. The
	// periodic sweep handles expiry; here we only need space for one new key.
	if (now - lastPrunedAt >= RATE_LIMIT_PRUNE_INTERVAL_MS) {
		pruneExpiredRateLimits(now);
	}
	while (buckets.size >= RATE_LIMIT_MAX_BUCKETS) {
		const oldest = buckets.keys().next().value;
		if (oldest === undefined) return;
		buckets.delete(oldest);
	}
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	maybePrune(now);
	const bucket = buckets.get(key);

	if (!bucket || bucket.resetAt <= now) {
		// Re-insert an expired key at the end so eviction order reflects use.
		if (bucket) buckets.delete(key);
		ensureCapacity(now);
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
	}

	if (bucket.count >= limit) {
		return {
			allowed: false,
			remaining: 0,
			retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
		};
	}

	bucket.count += 1;
	return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export function rateLimitBucketCountForTests(): number {
	return buckets.size;
}

export function resetRateLimitsForTests() {
	buckets.clear();
	lastPrunedAt = 0;
}
