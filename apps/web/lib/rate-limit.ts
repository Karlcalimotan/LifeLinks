/**
 * Small in-process rate limiter for login and device routes.
 *
 * This is deliberately simple: a fixed window per key. It is honest about its
 * scope — it does not coordinate across server instances, so a multi-instance
 * deployment should replace it with a shared store (Postgres or Redis). For a
 * single-node capstone deployment it closes the obvious brute-force door.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	const bucket = buckets.get(key);

	if (!bucket || bucket.resetAt <= now) {
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

export function resetRateLimitsForTests() {
	buckets.clear();
}
