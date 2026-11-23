import { describe, expect, it } from "vitest";
import { DEFAULT_FIRMWARE_CONFIG, type FirmwareConfigValues } from "./config";
import {
	configPushState,
	configRevFromPayload,
	mergeDeviceConfig,
	overrideRowToValues,
	sameDeviceConfigOverrides,
	validateDeviceConfigOverride,
} from "./device-config";

const ORG: FirmwareConfigValues = {
	impactThresholdG: 2.5,
	tiltThresholdDeg: 60,
	confirmWindowMs: 200,
	cancelWindowS: 15,
	heartbeatIntervalS: 30,
	sosRetryS: 60,
};

describe("validateDeviceConfigOverride", () => {
	it("accepts an empty override set as inherit everywhere", () => {
		const result = validateDeviceConfigOverride({});

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual({});
		expect(result.values).toEqual({});
	});

	it("accepts the envelope boundaries", () => {
		const result = validateDeviceConfigOverride({
			impactThresholdG: 1.5,
			tiltThresholdDeg: 90,
			confirmWindowMs: 2000,
			cancelWindowS: 5,
			heartbeatIntervalS: 300,
			sosRetryS: 30,
		});

		expect(result.ok).toBe(true);
		expect(result.values).toEqual({
			impactThresholdG: 1.5,
			tiltThresholdDeg: 90,
			confirmWindowMs: 2000,
			cancelWindowS: 5,
			heartbeatIntervalS: 300,
			sosRetryS: 30,
		});
	});

	it("rejects an out-of-envelope value with a field code instead of clamping it", () => {
		const tooHigh = validateDeviceConfigOverride({ impactThresholdG: 9 });
		const tooLow = validateDeviceConfigOverride({ heartbeatIntervalS: 4 });

		expect(tooHigh.ok).toBe(false);
		expect(tooHigh.errors).toEqual({ impactThresholdG: { code: "above_max" } });
		expect(tooHigh.values).toEqual({});

		expect(tooLow.ok).toBe(false);
		expect(tooLow.errors).toEqual({ heartbeatIntervalS: { code: "below_min" } });
		expect(tooLow.values).toEqual({});
	});

	it("keeps valid fields and reports only the invalid one", () => {
		const result = validateDeviceConfigOverride({
			impactThresholdG: 3.2,
			tiltThresholdDeg: 120,
		});

		expect(result.ok).toBe(false);
		expect(result.errors).toEqual({ tiltThresholdDeg: { code: "above_max" } });
		expect(result.values).toEqual({ impactThresholdG: 3.2 });
	});

	it("rejects fractional values on integer fields", () => {
		const result = validateDeviceConfigOverride({
			confirmWindowMs: 200.5,
			cancelWindowS: 15.5,
			heartbeatIntervalS: 30.5,
			sosRetryS: 60.5,
		});

		expect(result.ok).toBe(false);
		expect(result.errors).toEqual({
			confirmWindowMs: { code: "fractional" },
			cancelWindowS: { code: "fractional" },
			heartbeatIntervalS: { code: "fractional" },
			sosRetryS: { code: "fractional" },
		});
		expect(result.values).toEqual({});
	});

	it("allows fractional values on the two non-integer fields", () => {
		const result = validateDeviceConfigOverride({
			impactThresholdG: 2.75,
			tiltThresholdDeg: 45.5,
		});

		expect(result.ok).toBe(true);
		expect(result.values).toEqual({ impactThresholdG: 2.75, tiltThresholdDeg: 45.5 });
	});

	it("rejects text, blank input and non-finite numbers", () => {
		const text = validateDeviceConfigOverride({ impactThresholdG: "hard" });
		const blank = validateDeviceConfigOverride({ impactThresholdG: "  " });
		const infinite = validateDeviceConfigOverride({ impactThresholdG: Number.POSITIVE_INFINITY });

		expect(text.errors).toEqual({ impactThresholdG: { code: "not_a_number" } });
		expect(blank.errors).toEqual({ impactThresholdG: { code: "required" } });
		expect(infinite.errors).toEqual({ impactThresholdG: { code: "not_a_number" } });
	});

	it("parses numeric form strings", () => {
		const result = validateDeviceConfigOverride({
			impactThresholdG: "3.5",
			confirmWindowMs: "500",
		});

		expect(result.ok).toBe(true);
		expect(result.values).toEqual({ impactThresholdG: 3.5, confirmWindowMs: 500 });
	});
});

describe("mergeDeviceConfig", () => {
	it("prefers a device override per field and falls back to the organisation default", () => {
		const merged = mergeDeviceConfig(ORG, {
			impactThresholdG: 3.5,
			heartbeatIntervalS: 120,
		});

		expect(merged).toEqual({
			...DEFAULT_FIRMWARE_CONFIG,
			impactThresholdG: 3.5,
			heartbeatIntervalS: 120,
		});
		expect(merged.tiltThresholdDeg).toBe(ORG.tiltThresholdDeg);
		expect(merged.confirmWindowMs).toBe(ORG.confirmWindowMs);
	});

	it("treats null and undefined overrides as inherit", () => {
		const merged = mergeDeviceConfig(ORG, {
			impactThresholdG: null,
			tiltThresholdDeg: undefined,
		});

		expect(merged).toEqual(ORG);
	});

	it("does not mutate the organisation values", () => {
		const org = { ...ORG };
		mergeDeviceConfig(org, { impactThresholdG: 4 });

		expect(org).toEqual(ORG);
	});

	it("returns the organisation values when there is no override row", () => {
		expect(mergeDeviceConfig(ORG, null)).toEqual(ORG);
		expect(mergeDeviceConfig(ORG, undefined)).toEqual(ORG);
	});
});

describe("override presence", () => {
	it("turns a row into only its non-null overrides", () => {
		const values = overrideRowToValues({
			impactThresholdG: 3.5,
			tiltThresholdDeg: null,
			confirmWindowMs: 500,
			cancelWindowS: null,
			heartbeatIntervalS: 120,
			sosRetryS: null,
		});

		expect(values).toEqual({
			impactThresholdG: 3.5,
			confirmWindowMs: 500,
			heartbeatIntervalS: 120,
		});
		expect(overrideRowToValues(null)).toEqual({});
	});

	it("compares override sets field by field", () => {
		expect(sameDeviceConfigOverrides({}, {})).toBe(true);
		expect(
			sameDeviceConfigOverrides(
				{ impactThresholdG: 3 },
				{ impactThresholdG: 3, tiltThresholdDeg: 60 },
			),
		).toBe(false);
		expect(sameDeviceConfigOverrides({ impactThresholdG: 3 }, { impactThresholdG: 4 })).toBe(false);
	});
});

describe("configPushState", () => {
	it("has no state when nothing was pushed for the effective revision", () => {
		expect(configPushState(null, 123, null)).toBe("none");
		expect(configPushState(122, 123, null)).toBe("none");
	});

	it("stays pending while a push of the effective revision is unconfirmed", () => {
		expect(configPushState(null, 123, 123)).toBe("pending");
		expect(configPushState(122, 123, 123)).toBe("pending");
	});

	it("confirms when the device echoes the effective revision", () => {
		expect(configPushState(123, 123, 123)).toBe("confirmed");
		expect(configPushState(123, 123, null)).toBe("confirmed");
	});

	it("does not treat an older push as the current configuration", () => {
		expect(configPushState(123, 124, 123)).toBe("none");
		expect(configPushState(100, 124, 123)).toBe("none");
	});

	it("reads a revision from a stored payload only when it is a finite number", () => {
		expect(configRevFromPayload({ rev: 123 })).toBe(123);
		expect(configRevFromPayload({ rev: "123" })).toBeNull();
		expect(configRevFromPayload({})).toBeNull();
		expect(configRevFromPayload(null)).toBeNull();
	});
});
