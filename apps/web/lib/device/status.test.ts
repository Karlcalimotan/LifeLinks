import { describe, expect, it } from "vitest";
import { batteryBand, deviceConnectionState, gpsAgeSeconds, isGpsStale } from "./status";

const NOW = new Date("2026-11-18T12:00:00+08:00");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe("device connection state", () => {
	it("is unknown when the device has never reported", () => {
		expect(deviceConnectionState(null, NOW)).toBe("unknown");
	});

	it("is online inside the weak window", () => {
		expect(deviceConnectionState(minutesAgo(1), NOW)).toBe("online");
	});

	it("is weak between the two windows", () => {
		expect(deviceConnectionState(minutesAgo(3), NOW)).toBe("weak");
	});

	it("is offline after the offline window", () => {
		expect(deviceConnectionState(minutesAgo(6), NOW)).toBe("offline");
	});
});

describe("GPS freshness", () => {
	it("reports the age in seconds", () => {
		expect(gpsAgeSeconds(minutesAgo(2), NOW)).toBe(120);
	});

	it("treats a missing or old fix as stale", () => {
		expect(isGpsStale(null, NOW)).toBe(true);
		expect(isGpsStale(minutesAgo(3), NOW)).toBe(true);
		expect(isGpsStale(minutesAgo(1), NOW)).toBe(false);
	});
});

describe("battery bands", () => {
	it("classifies main, low and critical voltage", () => {
		expect(batteryBand(12.4)).toBe("ok");
		expect(batteryBand(11.7)).toBe("low");
		expect(batteryBand(10.9)).toBe("critical");
		expect(batteryBand(null)).toBe("unknown");
	});
});
