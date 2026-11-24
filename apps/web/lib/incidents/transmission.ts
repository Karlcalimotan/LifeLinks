/** The longest send-to-receive gap treated as a plausible console delay. */
export const MAX_TRANSMISSION_DELAY_S = 3600;

export interface TransmissionDelay {
	/** The moment the tracker says the dispatch left the device. */
	sentAt: Date;
	/** Whole seconds between the device send time and the console receipt. */
	delaySeconds: number;
}

/**
 * Transmission delay for a dispatched incident: the gap between the moment the
 * tracker started the emergency alert and the moment the console stored the
 * report.
 *
 * Returns null when the tracker recorded no send time, or when the gap is not a
 * plausible network delay. A negative gap means the device clock is ahead of
 * the console clock, and anything over an hour is a clock error rather than a
 * link that slow. Showing either would misstate the measurement, so the page
 * makes no claim instead.
 */
export function readTransmissionDelay(input: {
	sentAt: Date | null | undefined;
	createdAt: Date;
}): TransmissionDelay | null {
	if (!input.sentAt) return null;
	const deltaMs = input.createdAt.getTime() - input.sentAt.getTime();
	if (!Number.isFinite(deltaMs)) return null;
	const seconds = deltaMs / 1000;
	if (seconds < 0 || seconds > MAX_TRANSMISSION_DELAY_S) return null;
	return { sentAt: input.sentAt, delaySeconds: Math.round(seconds) };
}
