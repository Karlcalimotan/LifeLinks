import { describe, expect, it } from "vitest";
import { canTransition, isTerminal } from "./state";

describe("incident state machine", () => {
	it("allows the operator path from confirmed to resolved", () => {
		expect(canTransition("CONFIRMED", "ACKNOWLEDGED")).toBe(true);
		expect(canTransition("ACKNOWLEDGED", "RESOLVED")).toBe(true);
		expect(canTransition("CONFIRMED", "FALSE_ALARM")).toBe(true);
	});

	it("does not resurrect a cancelled incident", () => {
		expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
	});

	it("treats resolved and false alarm as terminal", () => {
		expect(isTerminal("RESOLVED")).toBe(true);
		expect(isTerminal("FALSE_ALARM")).toBe(true);
		expect(isTerminal("CONFIRMED")).toBe(false);
	});
});
