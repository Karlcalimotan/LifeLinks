const MAX_FUTURE_SKEW_S = 5 * 60;
const MAX_PAST_S = 30 * 24 * 60 * 60;

/**
 * Device clocks drift. Accept a timestamp only when it is plausible, and keep
 * the original value in the payload for audit. A rejected timestamp never
 * discards the sample: the caller falls back to receipt time and records the
 * difference in the event metadata.
 */
export function plausibleEpochSeconds(value: number, now = Date.now()): boolean {
	if (!Number.isFinite(value)) return false;
	const seconds = Math.floor(value);
	const nowS = Math.floor(now / 1000);
	if (seconds > nowS + MAX_FUTURE_SKEW_S) return false;
	if (seconds < nowS - MAX_PAST_S) return false;
	return true;
}

export function epochSecondsToDate(value: number): Date {
	return new Date(value * 1000);
}

export function dateToEpochSeconds(value: Date): number {
	return Math.floor(value.getTime() / 1000);
}

export function resolveDeviceTime(value: number | null | undefined, now = new Date()): Date {
	if (value != null && plausibleEpochSeconds(value, now.getTime())) {
		return epochSecondsToDate(value);
	}
	return now;
}
