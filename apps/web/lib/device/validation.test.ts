import { describe, expect, it } from "vitest";
import { createDeviceSchema, normalizeMac } from "./validation";

describe("device validation", () => {
	it("normalizes a MAC address", () => {
		expect(normalizeMac("aa-bb-cc-dd-ee-01")).toBe("AA:BB:CC:DD:EE:01");
	});

	it("accepts a valid registration", () => {
		const result = createDeviceSchema.safeParse({
			mac: "AA:BB:CC:DD:EE:01",
			label: "Navara tracker",
			vehicleId: "",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a malformed MAC and a short label", () => {
		expect(createDeviceSchema.safeParse({ mac: "nope", label: "x" }).success).toBe(false);
	});
});
