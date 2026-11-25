/**
 * The firmware version shipped with this repository. This is a display marker,
 * not an OTA manifest: the tracker list only says that a unit is behind this
 * version. `firmware/main/main.ino` is the source of truth and the test beside
 * this file fails when the two drift.
 */
export const KNOWN_FIRMWARE_VERSION = "0.3.1";

const VERSION_PATTERN = /^v?(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?$/;

type VersionParts = [number, number, number];

function versionParts(value: string | null | undefined): VersionParts | null {
	if (!value) return null;
	const match = VERSION_PATTERN.exec(value.trim());
	if (!match) return null;
	const parts: VersionParts = [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
	return parts.every((part) => Number.isFinite(part)) ? parts : null;
}

/** Compare numeric dotted versions without string-sorting `0.10` below `0.9`. */
export function compareFirmwareVersions(
	left: string | null | undefined,
	right: string | null | undefined,
): number | null {
	const a = versionParts(left);
	const b = versionParts(right);
	if (!a || !b) return null;
	for (let index = 0; index < 3; index += 1) {
		const diff = (a[index] as number) - (b[index] as number);
		if (diff !== 0) return diff;
	}
	return 0;
}

/**
 * True only when both versions are readable and the installed version is
 * strictly older. An unknown version never produces an update marker.
 */
export function firmwareUpdateAvailable(
	installed: string | null | undefined,
	latest: string | null | undefined = KNOWN_FIRMWARE_VERSION,
): boolean {
	const comparison = compareFirmwareVersions(installed, latest);
	return comparison != null && comparison < 0;
}

/**
 * Use a configured signed release when one exists; otherwise fall back to the
 * version shipped in the repository. The fallback keeps the marker honest
 * without inventing a rollout.
 */
export function latestKnownFirmware(configured?: string | null): string {
	const candidate = configured?.trim();
	return candidate ? candidate : KNOWN_FIRMWARE_VERSION;
}
