import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface PushUrlGlobal {
	LifeLinkPushUrl?: {
		safeNotificationUrl: (value: unknown, origin: string) => string;
	};
}

const source = readFileSync(path.join(process.cwd(), "public/sw-url.js"), "utf8");
const sandbox: { self: PushUrlGlobal } = { self: {} };
runInNewContext(source, { self: sandbox.self, URL });

const safe = sandbox.self.LifeLinkPushUrl?.safeNotificationUrl;
if (!safe) throw new Error("sw-url.js did not expose safeNotificationUrl");

const ORIGIN = "https://console.lifelink.test";

describe("service worker URL guard", () => {
	it("keeps a same-origin incident deep link", () => {
		expect(safe("/en/incidents/inc-1?action=cancel", ORIGIN)).toBe(
			"/en/incidents/inc-1?action=cancel",
		);
	});

	it("rejects a protocol-relative host", () => {
		expect(safe("//evil.com/incidents/1", ORIGIN)).toBe("/");
	});

	it("rejects a backslash-smuggled host", () => {
		expect(safe("/\\evil.com/incidents/1", ORIGIN)).toBe("/");
	});

	it("rejects a javascript: URL", () => {
		expect(safe("javascript:alert(1)", ORIGIN)).toBe("/");
	});

	it("rejects a cross-origin absolute URL", () => {
		expect(safe("https://evil.com/incidents/1", ORIGIN)).toBe("/");
	});

	it("rejects a non-string payload value", () => {
		expect(safe(undefined, ORIGIN)).toBe("/");
		expect(safe({ url: "/en/incidents/1" }, ORIGIN)).toBe("/");
	});
});
