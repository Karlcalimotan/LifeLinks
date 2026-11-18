/**
 * The server half of the firmware configuration contract.
 *
 * Class A (envelope) — the dashboard can never move a value outside this
 * window. Class B (operational) — every field below is editable within the
 * envelope. Class C (transport) — pins, URLs, NVS namespace and HTTP timeouts
 * live in the firmware and are deliberately absent here.
 *
 * `config.h` on the device carries the same table. `config.test.ts` parses the
 * header and fails the build when the two drift.
 */

export const FIRMWARE_CONFIG_VERSION = 1;

export interface FirmwareConfigValues {
	impactThresholdG: number;
	tiltThresholdDeg: number;
	confirmWindowMs: number;
	cancelWindowS: number;
	heartbeatIntervalS: number;
	sosRetryS: number;
}

export interface ConfigField {
	key: keyof FirmwareConfigValues;
	firmwareKey: string;
	min: number;
	max: number;
	integer: boolean;
	defaultValue: number;
}

export const CONFIG_FIELDS: readonly ConfigField[] = [
	{
		key: "impactThresholdG",
		firmwareKey: "impact_threshold_g",
		min: 1.5,
		max: 5.0,
		integer: false,
		defaultValue: 2.5,
	},
	{
		key: "tiltThresholdDeg",
		firmwareKey: "tilt_threshold_deg",
		min: 30,
		max: 90,
		integer: false,
		defaultValue: 60,
	},
	{
		key: "confirmWindowMs",
		firmwareKey: "confirm_window_ms",
		min: 100,
		max: 2_000,
		integer: true,
		defaultValue: 200,
	},
	{
		key: "cancelWindowS",
		firmwareKey: "cancel_window_s",
		min: 5,
		max: 60,
		integer: true,
		defaultValue: 15,
	},
	{
		key: "heartbeatIntervalS",
		firmwareKey: "heartbeat_interval_s",
		min: 10,
		max: 300,
		integer: true,
		defaultValue: 30,
	},
	{
		key: "sosRetryS",
		firmwareKey: "sos_retry_s",
		min: 30,
		max: 300,
		integer: true,
		defaultValue: 60,
	},
] as const;

export const DEFAULT_FIRMWARE_CONFIG: FirmwareConfigValues = Object.fromEntries(
	CONFIG_FIELDS.map((field) => [field.key, field.defaultValue]),
) as unknown as FirmwareConfigValues;

export interface ConfigValidation {
	ok: boolean;
	errors: string[];
	values: FirmwareConfigValues;
}

export function validateFirmwareConfig(input: Partial<FirmwareConfigValues>): ConfigValidation {
	const values = { ...DEFAULT_FIRMWARE_CONFIG };
	const errors: string[] = [];

	for (const field of CONFIG_FIELDS) {
		const raw = input[field.key];
		if (raw == null) continue;
		if (typeof raw !== "number" || !Number.isFinite(raw)) {
			errors.push(`${field.key} must be a finite number.`);
			continue;
		}
		if (field.integer && !Number.isInteger(raw)) {
			errors.push(`${field.key} must be a whole number.`);
			continue;
		}
		if (raw < field.min || raw > field.max) {
			errors.push(`${field.key} must be between ${field.min} and ${field.max}.`);
			continue;
		}
		values[field.key] = raw;
	}

	return { ok: errors.length === 0, errors, values };
}

export interface FirmwareConfigObject {
	version: number;
	rev: number;
	[key: string]: number;
}

/**
 * FNV-1a over the fixed field order. The device echoes `rev` in its next
 * heartbeat, so an operator can prove the unit applied this exact object.
 */
export function configRevision(values: FirmwareConfigValues): number {
	const canonical = CONFIG_FIELDS.map((field) => `${field.firmwareKey}=${values[field.key]}`).join(
		"&",
	);
	let hash = 0x811c9dc5;
	for (let index = 0; index < canonical.length; index += 1) {
		hash ^= canonical.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

export function buildFirmwareConfig(input: Partial<FirmwareConfigValues>): FirmwareConfigObject {
	const { ok, errors, values } = validateFirmwareConfig(input);
	if (!ok) throw new Error(`Refusing to build an invalid firmware config: ${errors.join(" ")}`);

	const payload: FirmwareConfigObject = {
		version: FIRMWARE_CONFIG_VERSION,
		rev: configRevision(values),
	};
	for (const field of CONFIG_FIELDS) {
		payload[field.firmwareKey] = values[field.key];
	}
	return payload;
}
