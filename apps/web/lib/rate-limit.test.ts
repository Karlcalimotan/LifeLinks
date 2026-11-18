import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimitsForTests } from "./rate-limit";

describe("rate limiter", () => {
	beforeEach(() => resetRateLimitsForTests());

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
});
