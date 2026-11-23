import { describe, expect, it } from "vitest";
import { MAX_RESOLUTION_LENGTH, boundResolution } from "./resolution";

describe("boundResolution", () => {
	it("keeps a normal note", () => {
		expect(boundResolution("  Driver confirmed safe  ", "Resolved by operator")).toBe(
			"Driver confirmed safe",
		);
	});

	it("uses the fallback for an empty note", () => {
		expect(boundResolution("   ", "Resolved by operator")).toBe("Resolved by operator");
	});

	it("bounds the note to the shared limit", () => {
		const note = "x".repeat(MAX_RESOLUTION_LENGTH + 200);
		expect(boundResolution(note, "Resolved by operator")).toHaveLength(MAX_RESOLUTION_LENGTH);
	});
});
