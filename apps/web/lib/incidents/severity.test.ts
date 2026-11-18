import { describe, expect, it } from "vitest";
import { severityFor, severityLabel } from "./severity";

describe("incident severity", () => {
	it("escalates with acceleration and tilt", () => {
		expect(severityFor(1.2, 5)).toBe("low");
		expect(severityFor(2.6, 10)).toBe("moderate");
		expect(severityFor(3.2, 10)).toBe("high");
		expect(severityFor(4.5, 10)).toBe("critical");
		expect(severityFor(1.2, 80)).toBe("critical");
	});

	it("has a human label for every band", () => {
		expect(severityLabel("low")).toBe("Low");
		expect(severityLabel("moderate")).toBe("Moderate");
		expect(severityLabel("high")).toBe("High");
		expect(severityLabel("critical")).toBe("Critical");
	});
});
