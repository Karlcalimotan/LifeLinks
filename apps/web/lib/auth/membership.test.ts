import { describe, expect, it } from "vitest";
import { isMembershipActive, membershipStatus } from "./membership";

describe("membership lifecycle", () => {
	it("treats a null revokedAt as active", () => {
		expect(isMembershipActive({ revokedAt: null })).toBe(true);
		expect(membershipStatus({ revokedAt: null })).toBe("active");
	});

	it("treats any revokedAt as revoked", () => {
		const revoked = { revokedAt: new Date("2026-11-24T08:00:00.000Z") };
		expect(isMembershipActive(revoked)).toBe(false);
		expect(membershipStatus(revoked)).toBe("revoked");
	});
});
