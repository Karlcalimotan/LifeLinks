import { describe, expect, it } from "vitest";
import { cn } from "./utils";

const SIZES = ["meta", "body", "emphasis", "section", "title", "display"] as const;

describe("cn", () => {
	it.each(SIZES)("keeps a text colour alongside the %s size", (size) => {
		expect(cn("text-ink-950", `text-${size}`)).toBe(`text-ink-950 text-${size}`);
	});

	it("keeps the last type-scale size when two are merged", () => {
		const result = cn("text-meta", "text-body");
		expect(result).toBe("text-body");
	});

	it("still resolves a real text-colour conflict", () => {
		expect(cn("text-fog-500", "text-fog-100")).toBe("text-fog-100");
	});
});
