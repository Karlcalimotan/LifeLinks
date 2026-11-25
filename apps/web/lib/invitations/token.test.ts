import { describe, expect, it } from "vitest";
import {
	INVITATION_TTL_MS,
	generateInvitationToken,
	hashInvitationToken,
	invitationExpiresAt,
	invitePath,
	inviteUrl,
	isInvitationTokenShape,
	isInvitationUsable,
} from "./token";

describe("invitation token", () => {
	it("generates 32 random bytes as unpadded base64url", () => {
		const token = generateInvitationToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(Buffer.from(token, "base64url")).toHaveLength(32);
	});

	it("does not repeat a token", () => {
		const tokens = new Set(Array.from({ length: 50 }, () => generateInvitationToken()));
		expect(tokens.size).toBe(50);
	});

	it("hashes with SHA-256 and never returns the plaintext", () => {
		const token = generateInvitationToken();
		const hash = hashInvitationToken(token);

		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash).not.toBe(token);
		expect(hash).not.toContain(token);
		expect(hashInvitationToken(token)).toBe(hash);
		expect(hashInvitationToken(generateInvitationToken())).not.toBe(hash);
	});

	it("accepts only well-formed tokens before hashing", () => {
		const token = generateInvitationToken();
		expect(isInvitationTokenShape(token)).toBe(true);
		expect(isInvitationTokenShape(`${token}x`)).toBe(false);
		expect(isInvitationTokenShape(token.slice(0, 42))).toBe(false);
		expect(isInvitationTokenShape("not a token with spaces!!!!!!!!!!!!!!!!!!!!")).toBe(false);
		expect(isInvitationTokenShape("")).toBe(false);
		expect(isInvitationTokenShape(null)).toBe(false);
		expect(isInvitationTokenShape(42)).toBe(false);
	});

	it("expires seven days after it is minted", () => {
		const now = new Date("2026-11-24T08:00:00.000Z");
		const expiresAt = invitationExpiresAt(now);

		expect(expiresAt.getTime() - now.getTime()).toBe(INVITATION_TTL_MS);
		expect(expiresAt.toISOString()).toBe("2026-12-01T08:00:00.000Z");
	});
});

describe("invitation lifecycle", () => {
	const now = new Date("2026-11-24T08:00:00.000Z");

	it("is usable while unused and unexpired", () => {
		expect(
			isInvitationUsable({ usedAt: null, expiresAt: new Date("2026-11-25T08:00:00.000Z") }, now),
		).toBe(true);
	});

	it("is not usable once used", () => {
		expect(
			isInvitationUsable(
				{
					usedAt: new Date("2026-11-24T07:59:59.000Z"),
					expiresAt: new Date("2026-12-01T08:00:00.000Z"),
				},
				now,
			),
		).toBe(false);
	});

	it("is not usable at or after the expiry instant", () => {
		expect(isInvitationUsable({ usedAt: null, expiresAt: now }, now)).toBe(false);
		expect(
			isInvitationUsable({ usedAt: null, expiresAt: new Date("2026-11-24T07:59:59.000Z") }, now),
		).toBe(false);
	});
});

describe("invitation links", () => {
	const token = "A".repeat(43);

	it("uses the locale path and falls back to en", () => {
		expect(invitePath("tl", token)).toBe(`/tl/invite/${token}`);
		expect(invitePath("en", token)).toBe(`/en/invite/${token}`);
		expect(invitePath("fr", token)).toBe(`/en/invite/${token}`);
	});

	it("joins an absolute base without a double slash", () => {
		expect(inviteUrl("https://lifelink.example", "en", token)).toBe(
			`https://lifelink.example/en/invite/${token}`,
		);
		expect(inviteUrl("https://lifelink.example/", "tl", token)).toBe(
			`https://lifelink.example/tl/invite/${token}`,
		);
	});
});
