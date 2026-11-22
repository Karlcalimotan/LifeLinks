import { describe, expect, it } from "vitest";
import {
	MAC_REGEX,
	createDeviceSchema,
	deleteDeviceSchema,
	normalizeMac,
	updateDeviceSchema,
} from "./validation";

describe("device validation", () => {
	it("normalizes colon, hyphen, dotted-group and compact MAC addresses", () => {
		expect(normalizeMac("aa-bb-cc-dd-ee-01")).toBe("AA:BB:CC:DD:EE:01");
		expect(normalizeMac(" aa:bb:cc:dd:ee:01 ")).toBe("AA:BB:CC:DD:EE:01");
		expect(normalizeMac("aabb.ccdd.ee01")).toBe("AA:BB:CC:DD:EE:01");
		expect(normalizeMac("aabbccddee01")).toBe("AA:BB:CC:DD:EE:01");
	});

	it("uses the canonical colon format for the MAC regex", () => {
		expect(MAC_REGEX.test("AA:BB:CC:DD:EE:01")).toBe(true);
		expect(MAC_REGEX.test("aa-bb-cc-dd-ee-01")).toBe(false);
		expect(MAC_REGEX.test("AABBCCDDEE01")).toBe(false);
	});

	it("accepts and normalizes a valid registration", () => {
		const result = createDeviceSchema.safeParse({
			mac: "aa-bb-cc-dd-ee-01",
			label: "  Navara tracker  ",
			vehicleId: "",
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.mac).toBe("AA:BB:CC:DD:EE:01");
		expect(result.data.label).toBe("Navara tracker");
		expect(result.data.vehicleId).toBe("");
	});

	it("rejects a malformed MAC with a field-level message", () => {
		const result = createDeviceSchema.safeParse({
			mac: "not-a-mac",
			label: "Navara tracker",
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.path).toEqual(["mac"]);
		expect(result.error.issues[0]?.message).toBe("Use a MAC address like 24:0A:C4:9F:2A:71.");
	});

	it("rejects a short label with a field-level message", () => {
		const result = createDeviceSchema.safeParse({
			mac: "AA:BB:CC:DD:EE:01",
			label: "x",
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.path).toEqual(["label"]);
		expect(result.error.issues[0]?.message).toBe("Enter a device label.");
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
