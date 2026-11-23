/**
 * Pure helpers for the tracker WiFi setup panel.
 *
 * The names and thresholds here mirror the firmware contract in
 * `firmware/main/provisioning.h`. Keep the AP derivation in step with it:
 * uppercase hex digits, separators ignored, last four digits, zero padded.
 */

/** The setup access point address served by the tracker while the portal is open. */
export const PROVISIONING_AP_ADDRESS = "192.168.4.1";

/** A tracker counts as configured only when its heartbeat is this fresh. */
export const PROVISIONING_FRESH_MS = 5 * 60_000;

export type ProvisioningState = "configured" | "needs_setup";

/**
 * Build the `LifeLink-XXXX` access point name from a MAC address.
 *
 * This is the same derivation the firmware performs from the eFuse MAC, so an
 * installer reads the identical name from this page and from the phone's WiFi
 * list. Non-hex characters are ignored and short input is zero padded, matching
 * the firmware tests.
 */
export function provisioningApName(mac: string | null | undefined): string {
	const hex = (mac ?? "").replaceAll(/[^0-9a-fA-F]/g, "").toUpperCase();
	const tail = hex.slice(-4).padStart(4, "0");
	return `LifeLink-${tail}`;
}

/**
 * Decide whether the tracker is already set up.
 *
 * `lastSeenAt` is the last heartbeat, not a live WiFi check. A missing, invalid
 * or older-than-five-minute heartbeat is "needs_setup" rather than a guess.
 * Future timestamps are also treated as unverified.
 */
export function provisioningState(
	lastSeenAt: Date | string | null | undefined,
	now = new Date(),
): ProvisioningState {
	if (!lastSeenAt) return "needs_setup";
	const seen = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
	const ageMs = now.getTime() - seen.getTime();
	if (Number.isNaN(ageMs)) return "needs_setup";
	return ageMs >= 0 && ageMs < PROVISIONING_FRESH_MS ? "configured" : "needs_setup";
}
