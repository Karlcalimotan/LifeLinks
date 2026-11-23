import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import tl from "../../messages/tl.json";

function leafPaths(value: unknown, prefix = ""): string[] {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];
	return Object.entries(value).flatMap(([key, child]) =>
		leafPaths(child, prefix ? `${prefix}.${key}` : key),
	);
}

describe("messages", () => {
	it("has the same keys in EN and TL", () => {
		expect(leafPaths(tl).sort()).toEqual(leafPaths(en).sort());
	});
});
