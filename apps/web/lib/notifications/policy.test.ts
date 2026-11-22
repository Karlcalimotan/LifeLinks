import { describe, expect, it } from "vitest";
import { summarizeTargets } from "./policy";

describe("summarizeTargets", () => {
	it("reports an empty summary when nothing is configured", () => {
		expect(summarizeTargets({ phones: [], emails: [] })).toEqual({
			total: 0,
			phones: 0,
			emails: 0,
		});
	});

	it("counts phones and emails separately", () => {
		expect(
			summarizeTargets({ phones: ["+639171234567", "+639181234567"], emails: ["ops@example.com"] }),
		).toEqual({
			total: 3,
			phones: 2,
			emails: 1,
		});
	});

	it("counts a repeated target once", () => {
		expect(
			summarizeTargets({
				phones: ["+639171234567", "+639171234567"],
				emails: ["ops@example.com", "ops@example.com"],
			}),
		).toEqual({
			total: 2,
			phones: 1,
			emails: 1,
		});
	});
});
