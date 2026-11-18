import { describe, expect, it } from "vitest";
import { alertTargetsFromSettings, buildSmsBody, normalizePhone } from "./templates";

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
});
