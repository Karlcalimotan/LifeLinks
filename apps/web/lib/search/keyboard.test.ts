import { describe, expect, it } from "vitest";
import { isTypingTarget, nextActiveIndex } from "./keyboard";

describe("isTypingTarget", () => {
	it("detects text fields, selects and contenteditable", () => {
		expect(isTypingTarget(document.createElement("input"))).toBe(true);
		expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
		expect(isTypingTarget(document.createElement("select"))).toBe(true);
		expect(
			isTypingTarget({
				tagName: "DIV",
				isContentEditable: true,
			} as unknown as EventTarget),
		).toBe(true);
	});

	it("returns false for buttons, links and a missing target", () => {
		expect(isTypingTarget(document.createElement("button"))).toBe(false);
		expect(isTypingTarget(document.createElement("a"))).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});

describe("nextActiveIndex", () => {
	it("starts at the first item when nothing is selected", () => {
		expect(nextActiveIndex(-1, 1, 5)).toBe(0);
		expect(nextActiveIndex(-1, -1, 5)).toBe(4);
	});

	it("wraps in both directions", () => {
		expect(nextActiveIndex(4, 1, 5)).toBe(0);
		expect(nextActiveIndex(0, -1, 5)).toBe(4);
		expect(nextActiveIndex(1, 1, 5)).toBe(2);
	});

	it("has no active item when the list is empty", () => {
		expect(nextActiveIndex(0, 1, 0)).toBe(-1);
		expect(nextActiveIndex(-1, -1, 0)).toBe(-1);
	});
});
