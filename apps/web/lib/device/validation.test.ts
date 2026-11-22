import { describe, expect, it } from "vitest";
import {
	createDeviceSchema,
	deleteDeviceSchema,
	normalizeMac,
	updateDeviceSchema,
} from "./validation";

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

describe("device update validation", () => {
	it("accepts a label with an assigned vehicle", () => {
		const result = updateDeviceSchema.safeParse({
			deviceId: "dev_1",
			label: "Navara tracker",
			vehicleId: "veh_1",
		});
		expect(result.success).toBe(true);
	});

	it("accepts an unassigned vehicle and rejects a short label", () => {
		expect(
			updateDeviceSchema.safeParse({
				deviceId: "dev_1",
				label: "Navara tracker",
				vehicleId: "",
			}).success,
		).toBe(true);
		expect(updateDeviceSchema.safeParse({ deviceId: "dev_1", label: "x" }).success).toBe(false);
	});

	it("requires a device id for update and delete", () => {
		expect(updateDeviceSchema.safeParse({ deviceId: "", label: "Navara tracker" }).success).toBe(
			false,
		);
		expect(deleteDeviceSchema.safeParse({ deviceId: "" }).success).toBe(false);
		expect(deleteDeviceSchema.safeParse({ deviceId: "dev_1" }).success).toBe(true);
	});
});
