import { rateLimit, resetRateLimitsForTests } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it } from "vitest";
import { heartbeatRequestSchema } from "./schema";

const heartbeat = {
	device_id: "AA:BB:CC:DD:EE:01",
	heartbeat: {
		battery_v: 12.4,
		ignition: true,
		rssi_dbm: -71,
		satellites: 8,
		hdop: 1.2,
		lat: 10.3157,
		lng: 123.8854,
		gps_fix_age_s: 3,
		accel_g: 0.4,
		tilt_deg: 2.1,
		vibration: false,
		config_rev: 42,
	},
};

describe("heartbeatRequestSchema", () => {
	it("accepts a full heartbeat", () => {
		expect(heartbeatRequestSchema.safeParse(heartbeat).success).toBe(true);
	});

	it("accepts a minimal heartbeat and optional firmware version", () => {
		const result = heartbeatRequestSchema.safeParse({
			device_id: "AA:BB:CC:DD:EE:01",
			firmware_version: "0.2.0",
			heartbeat: { ignition: false },
		});
		expect(result.success).toBe(true);
	});

	it("rejects a missing device id", () => {
		expect(heartbeatRequestSchema.safeParse({ heartbeat: heartbeat.heartbeat }).success).toBe(
			false,
		);
	});

	it("rejects an out-of-range coordinate", () => {
		const result = heartbeatRequestSchema.safeParse({
			...heartbeat,
			heartbeat: { ...heartbeat.heartbeat, lat: 91 },
		});
		expect(result.success).toBe(false);
	});
});

describe("device heartbeat rate limit", () => {
	beforeEach(() => {
		resetRateLimitsForTests();
	});

	it("allows the configured window and rejects the next heartbeat", () => {
		expect(rateLimit("device:a:heartbeat", 2, 60_000).allowed).toBe(true);
		expect(rateLimit("device:a:heartbeat", 2, 60_000).allowed).toBe(true);
		const blocked = rateLimit("device:a:heartbeat", 2, 60_000);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("keeps device keys independent", () => {
		rateLimit("device:a:heartbeat", 1, 60_000);
		expect(rateLimit("device:b:heartbeat", 1, 60_000).allowed).toBe(true);
	});
});
