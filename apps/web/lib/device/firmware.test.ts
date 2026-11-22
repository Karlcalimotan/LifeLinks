import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	KNOWN_FIRMWARE_VERSION,
	compareFirmwareVersions,
	firmwareUpdateAvailable,
	latestKnownFirmware,
} from "./firmware";

function firmwareVersionFromSource(): string | null {
	const source = readFileSync(path.resolve(process.cwd(), "../../firmware/main/main.ino"), "utf8");
	const match = /#define FW_VERSION "([^"]+)"/.exec(source);
	return match?.[1] ?? null;
}

describe("firmware versions", () => {
	it("keeps the marker constant in sync with the firmware source", () => {
		expect(firmwareVersionFromSource()).toBe(KNOWN_FIRMWARE_VERSION);
	});

	it("compares numeric segments rather than strings", () => {
		expect(compareFirmwareVersions("0.9.0", "0.10.0")).toBeLessThan(0);
		expect(compareFirmwareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
		expect(compareFirmwareVersions("1.2", "1.2.0")).toBe(0);
		expect(compareFirmwareVersions("v1.2.3", "1.2.3")).toBe(0);
	});

	it("returns null when either version is unknown", () => {
		expect(compareFirmwareVersions(null, "0.2.0")).toBeNull();
		expect(compareFirmwareVersions("0.1.0", undefined)).toBeNull();
		expect(compareFirmwareVersions("nightly", "0.2.0")).toBeNull();
	});

	it("marks only strictly older readable versions", () => {
		expect(firmwareUpdateAvailable("0.1.0", "0.2.0")).toBe(true);
		expect(firmwareUpdateAvailable("0.2.0", "0.2.0")).toBe(false);
		expect(firmwareUpdateAvailable("0.2.1", "0.2.0")).toBe(false);
		expect(firmwareUpdateAvailable("v0.1", "0.2.0")).toBe(true);
		expect(firmwareUpdateAvailable(null, "0.2.0")).toBe(false);
		expect(firmwareUpdateAvailable("0.1.0", null)).toBe(false);
		expect(firmwareUpdateAvailable("dev", "0.2.0")).toBe(false);
	});

	it("prefers a configured release and otherwise uses the repository version", () => {
		expect(latestKnownFirmware()).toBe(KNOWN_FIRMWARE_VERSION);
		expect(latestKnownFirmware("   ")).toBe(KNOWN_FIRMWARE_VERSION);
		expect(latestKnownFirmware("0.3.0")).toBe("0.3.0");
	});
});
