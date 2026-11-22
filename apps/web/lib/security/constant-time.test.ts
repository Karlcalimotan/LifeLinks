import { describe, expect, it } from "vitest";
import { safeEqualText } from "./constant-time";

describe("constant-time text comparison", () => {
	it("accepts identical values", () => {
		expect(safeEqualText("Bearer test-secret", "Bearer test-secret")).toBe(true);
	});

	it("rejects a same-length mismatch", () => {
		expect(safeEqualText("Bearer test-secret", "Bearer best-secret")).toBe(false);
	});

	it("rejects a length mismatch without comparing bytes", () => {
		expect(safeEqualText("Bearer test-secret", "Bearer test-secret-extra")).toBe(false);
		expect(safeEqualText("", "Bearer test-secret")).toBe(false);
	});
});
