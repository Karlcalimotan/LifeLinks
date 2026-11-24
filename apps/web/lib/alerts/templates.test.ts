import { describe, expect, it } from "vitest";
import {
	alertPhonesForDevice,
	alertTargetsForVehicle,
	alertTargetsFromSettings,
	buildSmsBody,
	normalizePhone,
} from "./templates";

describe("alert templates", () => {
	it("normalizes a Philippine mobile number", () => {
		expect(normalizePhone("+63 917 123 4567")).toBe("+639171234567");
		expect(normalizePhone("0917-123-4567")).toBe("09171234567");
		expect(normalizePhone("123")).toBeNull();
	});

	it("keeps the SOS body short and useful", () => {
		const body = buildSmsBody({
			plateNo: "ABC 1234",
			lat: 10.3157,
			lng: 123.8854,
			gpsAgeS: 3,
			speedKph: 45,
			detectedAt: new Date("2026-11-18T12:00:00+08:00"),
			callbackNumber: "+639171234567",
		});
		expect(body).toContain("LIFELINK SOS");
		expect(body).toContain("ABC 1234");
		expect(body).toContain("10.31570,123.88540");
		expect(body.length).toBeLessThanOrEqual(320);
	});

	it("says location unavailable when there is no fix", () => {
		const body = buildSmsBody({
			plateNo: "XYZ 5678",
			detectedAt: new Date("2026-11-18T12:00:00+08:00"),
		});
		expect(body).toContain("location unavailable");
	});

	it("filters invalid phones and emails from settings", () => {
		const targets = alertTargetsFromSettings({
			alertPhones: ["+63 917 123 4567", "123", 42],
			alertEmails: ["ops@example.com", "not-an-email"],
		});
		expect(targets.phones).toEqual(["+639171234567"]);
		expect(targets.emails).toEqual(["ops@example.com"]);
	});

	it("puts active vehicle contacts before the organisation list and dedupes", () => {
		const targets = alertTargetsForVehicle(
			{
				alertPhones: ["+63 917 123 4567", "+63 918 000 1111"],
				alertEmails: ["ops@example.com", "Owner@Example.com"],
			},
			[
				{ phone: "+63 917 111 2222", email: "owner@example.com", active: true },
				{ phone: "0918-000-1111", email: null, active: true },
				{ phone: "+63 917 999 8888", email: "archived@example.com", active: false },
				{ phone: "not-a-phone", email: "not-an-email", active: true },
			],
		);

		expect(targets.phones).toEqual(["+639171112222", "09180001111", "+639171234567"]);
		expect(targets.emails).toEqual(["owner@example.com", "ops@example.com"]);
	});

	it("caps each merged channel at ten targets", () => {
		const contacts = Array.from({ length: 12 }, (_, index) => ({
			phone: `+63917000${String(index).padStart(4, "0")}`,
			email: `contact${index}@example.com`,
			active: true,
		}));
		const settings = {
			alertPhones: Array.from(
				{ length: 5 },
				(_, index) => `+63918000${String(index).padStart(4, "0")}`,
			),
			alertEmails: Array.from({ length: 5 }, (_, index) => `org${index}@example.com`),
		};

		const targets = alertTargetsForVehicle(settings, contacts);

		expect(targets.phones).toHaveLength(10);
		expect(targets.emails).toHaveLength(10);
		expect(targets.phones[0]).toBe("+639170000000");
		expect(targets.phones[9]).toBe("+639170000009");
		expect(targets.emails[0]).toBe("contact0@example.com");
		expect(targets.emails[9]).toBe("contact9@example.com");
	});
});

describe("device alert phone selection", () => {
	const orgPhones = ["+639171234567", "+639181234567"];

	it("prefers the vehicle's active contacts over the organisation list", () => {
		const phones = alertPhonesForDevice(
			[
				{ phone: "+63 917 111 2222", active: true },
				{ phone: "+639173333444", active: true },
				{ phone: "+639179999000", active: false },
			],
			orgPhones,
		);

		expect(phones).toEqual(["+639171112222", "+639173333444"]);
	});

	it("caps the vehicle list at two numbers", () => {
		const phones = alertPhonesForDevice(
			[
				{ phone: "+639170000001", active: true },
				{ phone: "+639170000002", active: true },
				{ phone: "+639170000003", active: true },
			],
			orgPhones,
		);

		expect(phones).toEqual(["+639170000001", "+639170000002"]);
	});

	it("falls back to the organisation phones when the vehicle has no active contact", () => {
		expect(alertPhonesForDevice([], orgPhones)).toEqual(orgPhones);
		expect(alertPhonesForDevice([{ phone: "+639170000001", active: false }], orgPhones)).toEqual(
			orgPhones,
		);
	});
});
