import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
	it("keeps a text colour alongside a custom type-scale size", () => {
		const result = cn("text-ink-950", "text-body");
		expect(result).toContain("text-ink-950");
		expect(result).toContain("text-body");
	});

	it("keeps a text colour alongside the meta size", () => {
		const result = cn("text-fog-100", "text-meta");
		expect(result).toContain("text-fog-100");
		expect(result).toContain("text-meta");
	});

	it("keeps the last type-scale size when two are merged", () => {
		const result = cn("text-meta", "text-body");
		expect(result).toContain("text-body");
		expect(result).not.toContain("text-meta");
	});

	it("still resolves a real text-colour conflict", () => {
		expect(cn("text-fog-500", "text-fog-100")).toBe("text-fog-100");
	});
});
