import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	RATE_LIMIT_MAX_BUCKETS,
	pruneExpiredRateLimits,
	rateLimit,
	rateLimitBucketCountForTests,
	resetRateLimitsForTests,
} from "./rate-limit";

describe("rate limiter", () => {
	beforeEach(() => {
		resetRateLimitsForTests();
		vi.useRealTimers();
	});
	afterEach(() => vi.useRealTimers());

	it("allows up to the limit in a window", () => {
		const first = rateLimit("login:test", 2, 60_000);
		const second = rateLimit("login:test", 2, 60_000);
		const third = rateLimit("login:test", 2, 60_000);
		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
		expect(third.allowed).toBe(false);
		expect(third.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("keeps separate keys separate", () => {
		rateLimit("a", 1, 60_000);
		expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
	});

	it("starts a fresh window after the old one expires", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-23T00:00:00.000Z"));
		expect(rateLimit("expiring", 1, 1_000).allowed).toBe(true);
		expect(rateLimit("expiring", 1, 1_000).allowed).toBe(false);

		vi.setSystemTime(new Date("2026-11-23T00:00:01.001Z"));
		expect(rateLimit("expiring", 1, 1_000).allowed).toBe(true);
	});

	it("prunes expired buckets without touching live ones", () => {
		vi.useFakeTimers();
		const start = new Date("2026-11-23T00:00:00.000Z");
		vi.setSystemTime(start);
		rateLimit("expired", 1, 1_000);
		rateLimit("live", 1, 60_000);

		expect(pruneExpiredRateLimits(start.getTime() + 2_000)).toBe(1);
		expect(rateLimitBucketCountForTests()).toBe(1);
		expect(rateLimit("live", 1, 60_000).allowed).toBe(false);
	});

	it("caps the number of in-process buckets", () => {
		for (let index = 0; index < RATE_LIMIT_MAX_BUCKETS + 10; index += 1) {
			rateLimit(`flood:${index}`, 1, 60_000);
		}

		expect(rateLimitBucketCountForTests()).toBeLessThanOrEqual(RATE_LIMIT_MAX_BUCKETS);
		expect(rateLimit("after-cap", 1, 60_000).allowed).toBe(true);
	});
});
