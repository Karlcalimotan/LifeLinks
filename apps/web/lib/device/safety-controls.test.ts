import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandSchema } from "./validation";

const webRoot = process.cwd();

function readWeb(...segments: string[]): string {
	return readFileSync(path.join(webRoot, ...segments), "utf8");
}

const devicePage = readWeb("app", "[locale]", "(dashboard)", "devices", "[id]", "page.tsx");
const settingsPage = readWeb("app", "[locale]", "(dashboard)", "settings", "page.tsx");
const settingsAction = readWeb("lib", "actions", "settings.ts");
const orgSettings = readWeb("lib", "settings", "org.ts");
const firmware = readFileSync(path.resolve(webRoot, "../../firmware/main/main.ino"), "utf8");

describe("device command allowlist", () => {
	it.each(["LOCATE", "TEST_ALERT", "SET_CONFIG"])("accepts %s", (kind) => {
		expect(commandSchema.safeParse(kind).success).toBe(true);
	});

	it.each(["ARM", "DISARM"])("rejects %s because crash detection is always on", (kind) => {
		expect(commandSchema.safeParse(kind).success).toBe(false);
	});

	it("rejects command kinds that only another route may queue", () => {
		for (const kind of ["CANCEL_ALERT", "ACK_INCIDENT", "ROTATE_TOKEN", "", "arm"]) {
			expect(commandSchema.safeParse(kind).success).toBe(false);
		}
	});
});

describe("tracker page", () => {
	it("offers no arm or disarm control and no disarm confirmation", () => {
		expect(devicePage).not.toContain('"ARM"');
		expect(devicePage).not.toContain('"DISARM"');
		expect(devicePage).not.toContain("confirmDisarm");
	});

	it("keeps the supported commands and states that detection is always on", () => {
		expect(devicePage).toContain('kind: "LOCATE"');
		expect(devicePage).toContain('kind: "TEST_ALERT"');
		expect(devicePage).toContain("Crash detection is always on");
	});
});

describe("parked-impact setting", () => {
	it("is not rendered or accepted by the settings form", () => {
		expect(settingsPage).not.toContain("parkedImpactAlerts");
		expect(settingsAction).not.toContain("parkedImpactAlerts");
		expect(orgSettings).not.toContain("parkedImpactAlerts");
	});
});

describe("firmware arm and disarm handling", () => {
	// handleCommands lives in the sketch, which the host-native Unity build
	// cannot compile. Keep the branch honest with a source assertion instead of
	// claiming a native execution that did not happen.
	it("acknowledges ARM and DISARM as unsupported", () => {
		expect(firmware).toMatch(
			/kind == "ARM"\s*\|\|\s*kind == "DISARM"[\s\S]{0,400}?sendCommandAck\(id, "ACKED", "unsupported"\);/,
		);
	});

	it("keeps no armed flag that could imply detection can be turned off", () => {
		expect(firmware).not.toContain("g_armed");
	});
});
