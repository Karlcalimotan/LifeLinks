import { describe, expect, it } from "vitest";
import { cn, telHref } from "./utils";

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

describe("telHref", () => {
	it.each([
		["+63 917 123 4567", "tel:+639171234567"],
		["(033) 321-1234", "tel:0333211234"],
		["0917.123.4567", "tel:09171234567"],
	])("turns %s into %s", (phone, href) => {
		expect(telHref(phone)).toBe(href);
	});

	it.each([null, undefined, "", "   ", "call the desk", "12345"])(
		"rejects %s instead of inventing a link",
		(phone) => {
			expect(telHref(phone)).toBeNull();
		},
	);
});
