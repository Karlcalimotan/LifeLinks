/**
 * Per-device configuration overrides.
 *
 * The firmware contract has six server-driven fields (`config.ts`). An override
 * is optional per field: `null` or an absent key means "use the organisation
 * default". The envelope comes from the same `CONFIG_FIELDS` table the firmware
 * contract is checked against, so an override can never widen what the device
 * accepts. Invalid input is rejected with a field-level code, never clamped.
 */

import { CONFIG_FIELDS, type FirmwareConfigValues } from "./config";

export type DeviceConfigOverrides = Partial<Record<keyof FirmwareConfigValues, number | null>>;

export type DeviceConfigErrorCode =
	| "required"
	| "not_a_number"
	| "fractional"
	| "below_min"
	| "above_max";

export interface DeviceConfigFieldError {
	code: DeviceConfigErrorCode;
}

export type DeviceConfigFieldErrors = Partial<
	Record<keyof FirmwareConfigValues, DeviceConfigFieldError>
>;

export interface DeviceConfigValidation {
	ok: boolean;
	errors: DeviceConfigFieldErrors;
	values: DeviceConfigOverrides;
}

/** Form field names are shared by the client form and the server action. */
export const OVERRIDE_INPUT_PREFIX = "override.";

export function overrideInputName(key: keyof FirmwareConfigValues): string {
	return `${OVERRIDE_INPUT_PREFIX}${key}`;
}

interface ParsedFieldValue {
	value?: number;
	code?: DeviceConfigErrorCode;
}

function parseFieldValue(raw: unknown): ParsedFieldValue {
	if (typeof raw === "number") {
		return Number.isFinite(raw) ? { value: raw } : { code: "not_a_number" };
	}
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return { code: "required" };
		const value = Number(trimmed);
		return Number.isFinite(value) ? { value } : { code: "not_a_number" };
	}
	return { code: "required" };
}

/**
 * Validate a set of overrides. Missing and `null` entries are "inherit".
 * A present entry must pass the firmware envelope for its field; a fractional
 * value on an integer field is rejected before the range check.
 */
export function validateDeviceConfigOverride(
	input: Record<string, unknown>,
): DeviceConfigValidation {
	const errors: DeviceConfigFieldErrors = {};
	const values: DeviceConfigOverrides = {};

	for (const field of CONFIG_FIELDS) {
		const raw = input[field.key];
		if (raw == null) continue;

		const parsed = parseFieldValue(raw);
		if (parsed.code) {
			errors[field.key] = { code: parsed.code };
			continue;
		}

		const value = parsed.value as number;
		if (field.integer && !Number.isInteger(value)) {
			errors[field.key] = { code: "fractional" };
			continue;
		}
		if (value < field.min) {
			errors[field.key] = { code: "below_min" };
			continue;
		}
		if (value > field.max) {
			errors[field.key] = { code: "above_max" };
			continue;
		}

		values[field.key] = value;
	}

	return { ok: Object.keys(errors).length === 0, errors, values };
}

/**
 * The device runs `override ?? organisation default` for every field. The
 * organisation object is never mutated.
 */
export function mergeDeviceConfig(
	orgValues: FirmwareConfigValues,
	overrides: DeviceConfigOverrides | null | undefined,
): FirmwareConfigValues {
	const merged = { ...orgValues };
	if (!overrides) return merged;

	for (const field of CONFIG_FIELDS) {
		const value = overrides[field.key];
		if (typeof value === "number" && Number.isFinite(value)) merged[field.key] = value;
	}

	return merged;
}

export function hasDeviceConfigOverrides(
	overrides: DeviceConfigOverrides | null | undefined,
): boolean {
	return CONFIG_FIELDS.some((field) => typeof overrides?.[field.key] === "number");
}

export interface DeviceConfigOverrideRow {
	impactThresholdG: number | null;
	tiltThresholdDeg: number | null;
	confirmWindowMs: number | null;
	cancelWindowS: number | null;
	heartbeatIntervalS: number | null;
	sosRetryS: number | null;
}

/**
 * Turn an override row into the sparse value object the merge expects. A null
 * column is an inherited field and is deliberately absent from the result.
 */
export function overrideRowToValues(
	row: DeviceConfigOverrideRow | null | undefined,
): DeviceConfigOverrides {
	if (!row) return {};

	const values: DeviceConfigOverrides = {};
	if (row.impactThresholdG != null) values.impactThresholdG = row.impactThresholdG;
	if (row.tiltThresholdDeg != null) values.tiltThresholdDeg = row.tiltThresholdDeg;
	if (row.confirmWindowMs != null) values.confirmWindowMs = row.confirmWindowMs;
	if (row.cancelWindowS != null) values.cancelWindowS = row.cancelWindowS;
	if (row.heartbeatIntervalS != null) values.heartbeatIntervalS = row.heartbeatIntervalS;
	if (row.sosRetryS != null) values.sosRetryS = row.sosRetryS;
	return values;
}

export function sameDeviceConfigOverrides(
	left: DeviceConfigOverrides,
	right: DeviceConfigOverrides,
): boolean {
	return CONFIG_FIELDS.every((field) => (left[field.key] ?? null) === (right[field.key] ?? null));
}

export type ConfigPushState = "none" | "pending" | "confirmed";

/**
 * "Saved" is not proof the tracker applied the configuration. The device is
 * confirmed only when the `config_rev` it echoes matches the effective merged
 * configuration. A push of that same revision is pending until it does; any
 * other revision means no push for the current configuration was recorded.
 */
export function configPushState(
	deviceRev: number | null | undefined,
	effectiveRev: number,
	pushedRev: number | null | undefined,
): ConfigPushState {
	if (deviceRev != null && deviceRev === effectiveRev) return "confirmed";
	if (pushedRev != null && pushedRev === effectiveRev) return "pending";
	return "none";
}

/** Read the revision from a stored SET_CONFIG payload without trusting its shape. */
export function configRevFromPayload(payload: unknown): number | null {
	if (typeof payload !== "object" || payload === null) return null;
	const rev = (payload as { rev?: unknown }).rev;
	return typeof rev === "number" && Number.isFinite(rev) ? rev : null;
}
