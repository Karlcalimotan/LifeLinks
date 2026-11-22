import { describe, expect, it } from "vitest";
import {
	MAX_DEVICE_JSON_BYTES,
	MAX_DEVICE_JSON_KEYS,
	deviceEventSchema,
	incidentSchema,
} from "./schema";

const incident = {
	device_id: "AA:BB:CC:DD:EE:01",
	incident_id: "impact-1",
	detected_at: 1_700_000_000,
	peak_accel_g: 2.9,
	tilt_deg: 54,
	evidence: { samples: [{ t: 1, accel_g: 2.9 }] },
};

describe("device JSON bounds", () => {
	it("keeps the accepted incident shape for a small evidence payload", () => {
		const result = incidentSchema.safeParse(incident);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.evidence).toEqual(incident.evidence);
	});

	it("rejects evidence with too many top-level keys", () => {
		const evidence = Object.fromEntries(
			Array.from({ length: MAX_DEVICE_JSON_KEYS + 1 }, (_, index) => [`k${index}`, index]),
		);
		const result = incidentSchema.safeParse({ ...incident, evidence });
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.path).toEqual(["evidence"]);
		expect(result.error.issues[0]?.message).toContain("at most 32 keys");
	});

	it("rejects evidence above the serialized byte limit", () => {
		const result = incidentSchema.safeParse({
			...incident,
			evidence: { blob: "x".repeat(MAX_DEVICE_JSON_BYTES) },
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.path).toEqual(["evidence"]);
		expect(result.error.issues[0]?.message).toContain(`${MAX_DEVICE_JSON_BYTES} bytes`);
	});

	it("applies the same bounds to event metadata", () => {
		const meta = Object.fromEntries(
			Array.from({ length: MAX_DEVICE_JSON_KEYS + 1 }, (_, index) => [`k${index}`, true]),
		);
		expect(
			deviceEventSchema.safeParse({
				id: "event-1",
				type: "CONFIG_APPLIED",
				t: 1_700_000_000,
				meta,
			}).success,
		).toBe(false);

		expect(
			deviceEventSchema.safeParse({
				id: "event-1",
				type: "CONFIG_APPLIED",
				t: 1_700_000_000,
				meta: { rev: 3, source: "firmware" },
			}).success,
		).toBe(true);
	});
});
