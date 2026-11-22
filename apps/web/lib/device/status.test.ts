import { describe, expect, it } from "vitest";
import {
	batteryBand,
	deviceConnectionState,
	gpsAgeSeconds,
	isGpsStale,
	signalBand,
	signalBarCount,
} from "./status";

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

describe("signal bands", () => {
	it("classifies each RSSI threshold at and just below the boundary", () => {
		expect(signalBand(-55)).toBe("strong");
		expect(signalBand(-69)).toBe("strong");
		expect(signalBand(-70)).toBe("good");
		expect(signalBand(-79)).toBe("good");
		expect(signalBand(-80)).toBe("weak");
		expect(signalBand(-89)).toBe("weak");
		expect(signalBand(-90)).toBe("poor");
		expect(signalBand(-110)).toBe("poor");
	});

	it("treats a missing or invalid reading as unknown", () => {
		expect(signalBand(null)).toBe("unknown");
		expect(signalBand(undefined)).toBe("unknown");
		expect(signalBand(Number.NaN)).toBe("unknown");
	});

	it("maps bands to 0-4 bars", () => {
		expect(signalBarCount("strong")).toBe(4);
		expect(signalBarCount("good")).toBe(3);
		expect(signalBarCount("weak")).toBe(2);
		expect(signalBarCount("poor")).toBe(1);
		expect(signalBarCount("unknown")).toBe(0);
	});
});
