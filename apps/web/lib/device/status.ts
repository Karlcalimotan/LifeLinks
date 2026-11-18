import {
	DEVICE_OFFLINE_AFTER_MIN,
	DEVICE_WEAK_AFTER_MIN,
	GPS_STALE_AFTER_S,
} from "@/lib/constants";

export type DeviceConnectionState = "online" | "weak" | "offline" | "unknown";

const MINUTE_MS = 60_000;

/**
 * Three states, not two. A single missed heartbeat should not flip the whole
 * dashboard to offline, and a tracker that has never reported is "unknown"
 * rather than "offline".
 */
export function deviceConnectionState(
	lastSeenAt: Date | string | null | undefined,
	now = new Date(),
): DeviceConnectionState {
	if (!lastSeenAt) return "unknown";
	const seen = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
	const ageMs = now.getTime() - seen.getTime();
	if (Number.isNaN(ageMs)) return "unknown";
	if (ageMs < DEVICE_WEAK_AFTER_MIN * MINUTE_MS) return "online";
	if (ageMs < DEVICE_OFFLINE_AFTER_MIN * MINUTE_MS) return "weak";
	return "offline";
}

export function gpsAgeSeconds(
	lastFixAt: Date | string | null | undefined,
	now = new Date(),
): number | null {
	if (!lastFixAt) return null;
	const fix = typeof lastFixAt === "string" ? new Date(lastFixAt) : lastFixAt;
	const age = Math.round((now.getTime() - fix.getTime()) / 1000);
	return Number.isNaN(age) ? null : Math.max(0, age);
}

export function isGpsStale(lastFixAt: Date | string | null | undefined, now = new Date()): boolean {
	const age = gpsAgeSeconds(lastFixAt, now);
	return age == null || age > GPS_STALE_AFTER_S;
}

export function batteryBand(
	voltage: number | null | undefined,
): "ok" | "low" | "critical" | "unknown" {
	if (voltage == null || Number.isNaN(voltage)) return "unknown";
	if (voltage >= 12.0) return "ok";
	if (voltage >= 11.5) return "low";
	return "critical";
}

export function connectionLabel(state: DeviceConnectionState): string {
	switch (state) {
		case "online":
			return "Online";
		case "weak":
			return "Weak signal";
		case "offline":
			return "Offline";
		default:
			return "Never seen";
	}
}
