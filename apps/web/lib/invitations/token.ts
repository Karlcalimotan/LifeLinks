/**
 * Invitation token rules, kept pure so they can be unit-tested.
 *
 * A token is 32 random bytes encoded as base64url. Only the SHA-256 hash is
 * stored; the plaintext lives in the link the admin copies and is never
 * logged, audited or persisted. Tokens expire after seven days and are
 * single use.
 */
import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TOKEN_BYTES = 32;

/** 32 bytes of base64url is 43 characters, no padding. */
export const INVITATION_TOKEN_LENGTH = 43;

export const INVITATION_TTL_DAYS = 7;
export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function generateInvitationToken(): string {
	return randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/**
 * Reject obvious junk before hashing or querying. This is a cheap shape check,
 * not a substitute for the hash lookup: an attacker cannot learn whether a
 * well-formed token exists from it.
 */
export function isInvitationTokenShape(value: unknown): value is string {
	return typeof value === "string" && TOKEN_SHAPE.test(value);
}

export function invitationExpiresAt(now: Date = new Date()): Date {
	return new Date(now.getTime() + INVITATION_TTL_MS);
}

export interface InvitationLifecycle {
	usedAt: Date | null;
	expiresAt: Date;
}

/**
 * A token is usable only while it has never been consumed and has not expired.
 * Callers must return one generic error for every false result so the accept
 * page does not reveal whether a token existed, was used or expired.
 */
export function isInvitationUsable(
	invitation: InvitationLifecycle,
	now: Date = new Date(),
): boolean {
	return invitation.usedAt == null && invitation.expiresAt.getTime() > now.getTime();
}

/** The localized path an admin copies. The token is URL-safe base64url. */
export function invitePath(locale: string, token: string): string {
	const safeLocale = locale === "tl" ? "tl" : "en";
	return `/${safeLocale}/invite/${token}`;
}

/** Absolute link for the copy button, with no double slash at the join. */
export function inviteUrl(baseUrl: string, locale: string, token: string): string {
	return `${baseUrl.replace(/\/$/, "")}${invitePath(locale, token)}`;
}
