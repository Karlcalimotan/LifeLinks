import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");

describe("service worker", () => {
	it("handles push and notification clicks", () => {
		expect(source).toContain('addEventListener("push"');
		expect(source).toContain('addEventListener("notificationclick"');
		expect(source).toContain("showNotification");
	});

	it("offers the Android cancel action and opens the incident deep link", () => {
		expect(source).toContain('action: "cancel"');
		expect(source).toContain('"Cancel alert"');
		expect(source).toContain("openWindow");
		expect(source).toContain("navigate");
	});

	it("reads only the agreed payload fields", () => {
		for (const field of ["incidentId", "plate", "body", "url"]) {
			expect(source).toContain(`payload.${field}`);
		}
		for (const forbidden of ["token", "p256dh", "auth", "latitude", "longitude", "phone"]) {
			expect(source.toLowerCase()).not.toContain(forbidden);
		}
	});

	it("never caches private responses", () => {
		expect(source).not.toContain('addEventListener("fetch"');
		expect(source).not.toContain("caches.");
		expect(source).not.toContain("indexedDB");
	});

	it("refuses to open a cross-origin or scheme-relative URL", () => {
		expect(source).toContain('value.startsWith("/")');
		expect(source).toContain('value.startsWith("//")');
	});
});
