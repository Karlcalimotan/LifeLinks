import { z } from "zod";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/** A crash payload is a small summary, not an arbitrary JSON upload. */
export const MAX_DEVICE_JSON_KEYS = 32;
export const MAX_DEVICE_JSON_BYTES = 8 * 1024;

const encoder = new TextEncoder();

function jsonRecord(label: string) {
	return z
		.record(z.string(), z.unknown())
		.refine((value) => Object.keys(value).length <= MAX_DEVICE_JSON_KEYS, {
			message: `${label} can contain at most ${MAX_DEVICE_JSON_KEYS} keys.`,
		})
		.refine(
			(value) => {
				try {
					return encoder.encode(JSON.stringify(value) ?? "").length <= MAX_DEVICE_JSON_BYTES;
				} catch {
					return false;
				}
			},
			{ message: `${label} must be at most ${MAX_DEVICE_JSON_BYTES} bytes when serialized.` },
		);
}

export const heartbeatSchema = z.object({
	battery_v: z.number().min(0).max(30).optional(),
	ignition: z.boolean().optional(),
	rssi_dbm: z.number().int().min(-140).max(0).optional(),
	satellites: z.number().int().min(0).max(64).optional(),
	hdop: z.number().min(0).max(50).optional(),
	lat: lat.optional(),
	lng: lng.optional(),
	gps_fix_age_s: z.number().int().min(0).max(86_400).optional(),
	accel_g: z.number().min(0).max(50).optional(),
	tilt_deg: z.number().min(0).max(180).optional(),
	vibration: z.boolean().optional(),
	config_rev: z.number().int().min(0).optional(),
});

export const telemetrySampleSchema = z.object({
	id: z.string().min(1).max(64),
	t: z.number().int(),
	lat: lat.optional(),
	lng: lng.optional(),
	speed_kph: z.number().min(0).max(400).optional(),
	heading_deg: z.number().min(0).max(360).optional(),
	accel_g: z.number().min(0).max(50).optional(),
	tilt_deg: z.number().min(0).max(180).optional(),
	vibration: z.boolean().optional(),
	satellites: z.number().int().min(0).max(64).optional(),
	hdop: z.number().min(0).max(50).optional(),
	battery_v: z.number().min(0).max(30).optional(),
	ignition: z.boolean().optional(),
});

export const deviceEventSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.enum([
		"POWER_LOST",
		"POWER_RESTORED",
		"GPS_FIX_LOST",
		"MODEM_FAULT",
		"SENSOR_FAULT",
		"CONFIG_APPLIED",
		"INCIDENT_CANCELLED",
		"INCIDENT_CONFIRMED",
		"OTA_INSTALLED",
		"OTA_ROLLED_BACK",
		"SAFE_MODE_ENTERED",
	]),
	t: z.number().int(),
	meta: jsonRecord("Event meta").optional(),
});

export const ingestSchema = z.object({
	device_id: z.string().min(1).max(64),
	firmware_version: z.string().max(32).optional(),
	heartbeat: heartbeatSchema,
	samples: z.array(telemetrySampleSchema).max(60).default([]),
	events: z.array(deviceEventSchema).max(30).default([]),
});

/** A heartbeat-only request; batched telemetry and events stay on /ingest. */
export const heartbeatRequestSchema = ingestSchema.pick({
	device_id: true,
	firmware_version: true,
	heartbeat: true,
});

export const incidentSchema = z.object({
	device_id: z.string().min(1).max(64),
	incident_id: z.string().min(1).max(64),
	detected_at: z.number().int(),
	peak_accel_g: z.number().min(0).max(50),
	tilt_deg: z.number().min(0).max(180),
	vibration_count: z.number().int().min(0).max(10_000).default(0),
	speed_kph: z.number().min(0).max(400).optional(),
	lat: lat.optional(),
	lng: lng.optional(),
	gps_age_s: z.number().int().min(0).max(86_400).optional(),
	status: z.enum(["SUSPECTED", "CONFIRMED", "CANCELLED"]).default("CONFIRMED"),
	cancelled: z.boolean().default(false),
	evidence: jsonRecord("Incident evidence").optional(),
});

export const commandAckSchema = z.object({
	device_id: z.string().min(1).max(64),
	command_id: z.string().min(1).max(64),
	status: z.enum(["ACKED", "FAILED"]),
	detail: z.string().max(500).optional(),
});

export type HeartbeatInput = z.infer<typeof heartbeatRequestSchema>;
export type IngestInput = z.infer<typeof ingestSchema>;
export type IncidentInput = z.infer<typeof incidentSchema>;
export type CommandAckInput = z.infer<typeof commandAckSchema>;
