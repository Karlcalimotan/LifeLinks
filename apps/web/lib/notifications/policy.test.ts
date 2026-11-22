import { describe, expect, it } from "vitest";
import { summarizeTargets } from "./policy";

describe("summarizeTargets", () => {
	it("reports no channels when nothing is configured", () => {
		expect(summarizeTargets({ phones: [], emails: [] })).toEqual({
			total: 0,
			phones: 0,
			emails: 0,
			channels: [],
		});
	});

	it("counts phones and emails separately", () => {
		expect(
			summarizeTargets({ phones: ["+639171234567", "+639181234567"], emails: ["ops@example.com"] }),
		).toEqual({
			total: 3,
			phones: 2,
			emails: 1,
			channels: ["SMS", "EMAIL"],
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
			channels: ["SMS", "EMAIL"],
		});
	});

	it("only lists the channels that have targets", () => {
		expect(summarizeTargets({ phones: ["+639171234567"], emails: [] }).channels).toEqual(["SMS"]);
		expect(summarizeTargets({ phones: [], emails: ["ops@example.com"] }).channels).toEqual([
			"EMAIL",
		]);
	});
});
