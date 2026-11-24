import { describe, expect, it } from "vitest";
import { contactFormSchema, createVehicleSchema } from "./validation";

const baseVehicle = {
	plateNo: "abc 1234",
	make: "Toyota",
	model: "Hilux",
	year: "2020",
	vin: "",
	driverName: "",
	driverPhone: "",
};

describe("vehicle form validation", () => {
	it("normalises the plate and keeps the year numeric", () => {
		const parsed = createVehicleSchema.safeParse({
			...baseVehicle,
			plateNo: "  abc   1234 ",
			vin: "  abc123 ",
			driverPhone: "+63 917 123 4567",
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.plateNo).toBe("ABC 1234");
		expect(parsed.data.year).toBe(2020);
		expect(parsed.data.vin).toBe("ABC123");
		expect(parsed.data.driverPhone).toBe("+639171234567");
	});

	it("accepts a blank optional field and an empty year", () => {
		const parsed = createVehicleSchema.safeParse({
			...baseVehicle,
			year: "",
			driverPhone: "",
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.year).toBeNull();
		expect(parsed.data.driverPhone).toBeNull();
	});

	it("rejects a year outside the bounded range and an invalid phone", () => {
		const old = createVehicleSchema.safeParse({ ...baseVehicle, year: "1899" });
		expect(old.success).toBe(false);

		const phone = createVehicleSchema.safeParse({ ...baseVehicle, driverPhone: "123" });
		expect(phone.success).toBe(false);
	});

	it("requires make, model and plate within their bounds", () => {
		expect(createVehicleSchema.safeParse({ ...baseVehicle, plateNo: "" }).success).toBe(false);
		expect(createVehicleSchema.safeParse({ ...baseVehicle, make: "" }).success).toBe(false);
		expect(createVehicleSchema.safeParse({ ...baseVehicle, model: "x".repeat(61) }).success).toBe(
			false,
		);
	});
});

describe("contact form validation", () => {
	const baseContact = {
		name: "Maria Cruz",
		phone: "+63 917 111 2222",
		email: "",
		vehicleId: "veh-1",
	};

	it("normalises the phone and lowers the email", () => {
		const parsed = contactFormSchema.safeParse({
			...baseContact,
			email: "Maria@Example.com",
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.phone).toBe("+639171112222");
		expect(parsed.data.email).toBe("maria@example.com");
	});

	it("allows an empty email and a blank vehicle at the schema level", () => {
		const parsed = contactFormSchema.safeParse({ ...baseContact, vehicleId: "" });

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.email).toBeNull();
	});

	it("rejects an invalid phone and email", () => {
		expect(contactFormSchema.safeParse({ ...baseContact, phone: "123" }).success).toBe(false);
		expect(contactFormSchema.safeParse({ ...baseContact, email: "nope" }).success).toBe(false);
		expect(contactFormSchema.safeParse({ ...baseContact, name: "" }).success).toBe(false);
	});
});
