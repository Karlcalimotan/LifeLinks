import { describe, expect, it } from "vitest";
import { fail, ok } from "./envelope";
import { ApiError, badRequest } from "./errors";

describe("API envelope", () => {
	it("wraps success data with a request id", async () => {
		const response = ok({ hello: "world" });
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.data.hello).toBe("world");
		expect(body.meta.requestId).toBeTruthy();
		expect(response.headers.get("x-request-id")).toBe(body.meta.requestId);
	});

	it("normalizes a known error", async () => {
		const response = fail(badRequest("bad payload", { field: "x" }));
		const body = await response.json();
		expect(response.status).toBe(400);
		expect(body.error.code).toBe("BAD_REQUEST");
		expect(body.error.details).toEqual({ field: "x" });
	});

	it("does not leak an unknown error message as a stack trace", async () => {
		const response = fail(new ApiError(500, "INTERNAL", "Something went wrong"));
		const body = await response.json();
		expect(body.error.code).toBe("INTERNAL");
		expect(body.error.message).toBe("Something went wrong");
	});
});
