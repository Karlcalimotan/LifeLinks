import { describe, expect, it } from "vitest";
import { BULK_APPROVE_MAX, DEVICE_ID_MAX_LENGTH, parseBulkDeviceIds } from "./bulk";

describe("parseBulkDeviceIds", () => {
	it("trims ids and removes duplicates in first-seen order", () => {
		const result = parseBulkDeviceIds([" c1 ", "c2", "c1", "", "c3"]);

		expect(result.ids).toEqual(["c1", "c2", "c3"]);
		expect(result.overflow).toBe(false);
		expect(result.ignored).toBe(2);
	});

	it("ignores ids longer than the bound", () => {
		const result = parseBulkDeviceIds(["a".repeat(DEVICE_ID_MAX_LENGTH + 1), "c1"]);

		expect(result.ids).toEqual(["c1"]);
		expect(result.overflow).toBe(false);
		expect(result.ignored).toBe(1);
	});

	it("accepts exactly the maximum and flags one more unique id", () => {
		const accepted = Array.from({ length: BULK_APPROVE_MAX }, (_, index) => `id-${index}`);
		const atLimit = parseBulkDeviceIds(accepted);
		const overLimit = parseBulkDeviceIds([...accepted, "id-extra"]);

		expect(atLimit.ids).toHaveLength(BULK_APPROVE_MAX);
		expect(atLimit.overflow).toBe(false);
		expect(overLimit.ids).toHaveLength(BULK_APPROVE_MAX);
		expect(overLimit.overflow).toBe(true);
	});

	it("does not treat a duplicate beyond the limit as overflow", () => {
		const accepted = Array.from({ length: BULK_APPROVE_MAX }, (_, index) => `id-${index}`);
		const result = parseBulkDeviceIds([...accepted, accepted[0] as string]);

		expect(result.overflow).toBe(false);
		expect(result.ignored).toBe(1);
	});

	it("returns an empty selection for no usable input", () => {
		expect(parseBulkDeviceIds([])).toEqual({ ids: [], overflow: false, ignored: 0 });
		expect(parseBulkDeviceIds(["", "   "])).toEqual({ ids: [], overflow: false, ignored: 2 });
	});
});
