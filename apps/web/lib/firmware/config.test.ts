import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	CONFIG_FIELDS,
	buildFirmwareConfig,
	configRevision,
	validateFirmwareConfig,
} from "./config";

interface HeaderField {
	key: string;
	firmwareKey: string;
	min: number;
	max: number;
	integer: boolean;
	defaultValue: number;
}

function readFirmwareFields(): HeaderField[] {
	const header = readFileSync(path.resolve(process.cwd(), "../../firmware/main/config.h"), "utf8");
	const matches = [
		...header.matchAll(
			/X\((\w+),\s*"([^"]+)",\s*([\d.]+)f,\s*([\d.]+)f,\s*(true|false),\s*([\d.]+)f\)/g,
		),
	];
	return matches.map((match) => ({
		key: match[1] as string,
		firmwareKey: match[2] as string,
		min: Number(match[3]),
		max: Number(match[4]),
		integer: match[5] === "true",
		defaultValue: Number(match[6]),
	}));
}

describe("firmware config contract", () => {
	it("matches the fields, envelope, type and defaults in config.h", () => {
		const firmware = readFirmwareFields();
		expect(firmware).toHaveLength(CONFIG_FIELDS.length);
		expect(firmware).toEqual(
			CONFIG_FIELDS.map((field) => ({
				key: field.key,
				firmwareKey: field.firmwareKey,
				min: field.min,
				max: field.max,
				integer: field.integer,
				defaultValue: field.defaultValue,
			})),
		);
	});

	it("rejects an out-of-envelope value instead of clamping it", () => {
		const result = validateFirmwareConfig({ impactThresholdG: 9 });
		expect(result.ok).toBe(false);
		expect(result.errors.join(" ")).toContain("impactThresholdG");
		expect(() => buildFirmwareConfig({ tiltThresholdDeg: 120 })).toThrow(
			/invalid firmware config/i,
		);
	});

	it("builds a stable revision for the same values", () => {
		const first = buildFirmwareConfig({});
		const second = buildFirmwareConfig({});
		expect(first.rev).toBe(second.rev);
		expect(first.version).toBe(1);
		expect(first.impact_threshold_g).toBe(2.5);
		expect(
			configRevision({
				impactThresholdG: 3,
				tiltThresholdDeg: 60,
				confirmWindowMs: 200,
				cancelWindowS: 15,
				heartbeatIntervalS: 30,
				sosRetryS: 60,
			}),
		).not.toBe(first.rev);
	});
});
