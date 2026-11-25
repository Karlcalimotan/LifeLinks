import { describe, expect, it } from "vitest";
import {
	buildIncidentPushPayload,
	incidentNotificationTitle,
	incidentNotificationUrl,
	isCancelActionFocus,
	normalizePushLocale,
} from "./payload";

describe("incident push payload", () => {
	it("contains only the incident id, plate, body and relative URL", () => {
		const payload = buildIncidentPushPayload({
			incidentId: "inc-123",
			plate: "ABC 1234",
			locale: "en",
		});

		expect(Object.keys(payload).sort()).toEqual(["body", "incidentId", "plate", "url"]);
		expect(payload.incidentId).toBe("inc-123");
		expect(payload.plate).toBe("ABC 1234");
		expect(payload.url).toBe("/en/incidents/inc-123?action=cancel");
		expect(payload.body).toBe("Crash detected. Open to review or stand the alert down.");
	});

	it("localises the body and the deep link", () => {
		const payload = buildIncidentPushPayload({
			incidentId: "inc-1",
			plate: "XYZ 987",
			locale: "tl",
		});

		expect(payload.body).toBe("May na-detect na bangga. Buksan para suriin o ihinto ang alert.");
		expect(payload.url).toBe("/tl/incidents/inc-1?action=cancel");
	});

	it("falls back to English for an unknown locale", () => {
		const payload = buildIncidentPushPayload({
			incidentId: "inc-1",
			plate: "XYZ 987",
			locale: "de",
		});

		expect(normalizePushLocale("de")).toBe("en");
		expect(payload.url).toBe("/en/incidents/inc-1?action=cancel");
		expect(payload.body).toContain("Crash detected.");
	});

	it("never carries a token, key, coordinate or driver name", () => {
		const serialized = JSON.stringify(
			buildIncidentPushPayload({ incidentId: "inc-9", plate: "ABC 123", locale: "en" }),
		);
		for (const forbidden of [
			"token",
			"p256dh",
			"auth",
			"driver",
			"phone",
			"latitude",
			"longitude",
			"bearer",
		]) {
			expect(serialized.toLowerCase()).not.toContain(forbidden);
		}
	});

	it("bounds the plate and keeps a plain string", () => {
		const long = buildIncidentPushPayload({
			incidentId: "inc-1",
			plate: "A".repeat(80),
			locale: "en",
		});
		expect(long.plate).toHaveLength(40);
		expect(incidentNotificationTitle("<b>ABC</b>")).toBe("LifeLink · <b>ABC</b>");
	});

	it("uses a neutral title when the plate is blank", () => {
		expect(incidentNotificationTitle("   ")).toBe("LifeLink");
	});

	it("encodes the incident id in the deep link", () => {
		expect(incidentNotificationUrl("en", "a/b c")).toBe("/en/incidents/a%2Fb%20c?action=cancel");
	});

	it("recognises only the cancel focus parameter", () => {
		expect(isCancelActionFocus("cancel")).toBe(true);
		expect(isCancelActionFocus("resolve")).toBe(false);
		expect(isCancelActionFocus(undefined)).toBe(false);
		expect(isCancelActionFocus(["cancel"])).toBe(false);
	});
});
