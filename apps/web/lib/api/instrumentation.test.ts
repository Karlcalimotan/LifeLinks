import { describe, expect, it } from "vitest";
import { ok } from "./envelope";
import { badRequest } from "./errors";
import { withApi } from "./instrumentation";

function request(headers?: HeadersInit) {
	return new Request("http://localhost/api/test", { headers });
}

describe("withApi", () => {
	it("adds matching request-id and timing headers", async () => {
		const handler = withApi(async () => ok({ hello: "world" }), { route: "GET /api/test" });
		const response = await handler(request({ "x-request-id": "abc-123" }));
		const body = await response.json();

		expect(response.headers.get("x-request-id")).toBe("abc-123");
		expect(body.meta.requestId).toBe("abc-123");
		expect(body.meta.request_id).toBe("abc-123");
		expect(response.headers.get("server-timing")).toMatch(/^total;dur=/);
		expect(response.headers.get("x-response-time")).toMatch(/ms$/);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("replaces an unsafe incoming request id", async () => {
		const handler = withApi(async () => ok({}));
		const response = await handler(request({ "x-request-id": "bad id with spaces" }));
		const body = await response.json();

		expect(response.headers.get("x-request-id")).not.toBe("bad id with spaces");
		expect(body.meta.request_id).toBe(response.headers.get("x-request-id"));
	});

	it("normalizes errors with request-id and timing headers", async () => {
		const handler = withApi(
			async () => {
				throw badRequest("Invalid payload.", { field: "x" });
			},
			{ route: "GET /api/test" },
		);
		const response = await handler(request({ "x-request-id": "err-1" }));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error.code).toBe("BAD_REQUEST");
		expect(body.error.request_id).toBe("err-1");
		expect(response.headers.get("x-request-id")).toBe("err-1");
		expect(response.headers.get("server-timing")).toMatch(/^total;dur=/);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("returns 504 TIMEOUT when a handler exceeds its budget", async () => {
		const handler = withApi(
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return ok({});
			},
			{ route: "GET /api/slow", timeoutMs: 10 },
		);
		const response = await handler(request());
		const body = await response.json();

		expect(response.status).toBe(504);
		expect(body.error.code).toBe("TIMEOUT");
		expect(body.error.request_id).toBe(response.headers.get("x-request-id"));
	});
});
