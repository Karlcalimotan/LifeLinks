import { timingSafeEqual } from "node:crypto";

/**
 * Compare two strings without an early exit on the first differing byte. The
 * length check is unavoidable and leaks only the length, which is already
 * public for a bearer prefix and a configured secret's size class.
 */
export function safeEqualText(left: string, right: string): boolean {
	const a = Buffer.from(left, "utf8");
	const b = Buffer.from(right, "utf8");
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
