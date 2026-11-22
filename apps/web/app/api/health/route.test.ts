// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: queryRaw } }));

async function loadRoute() {
	vi.resetModules();
	return import("./route");
}

function request(ip = "203.0.113.10") {
	return new Request("http://localhost/api/health", {
		headers: { "x-forwarded-for": ip },
	});
}

describe("health endpoint", () => {
	beforeEach(() => {
		queryRaw.mockReset();
		queryRaw.mockResolvedValue([{ "?column?": 1 }]);
	});

	it("reports reachability without leaking which secrets are configured", async () => {
		const { GET } = await loadRoute();
		const response = await GET(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.status).toBe("ok");
		expect(body.database).toBe("reachable");
		expect(body.request_id).toBeTruthy();
		expect(body).not.toHaveProperty("env");
		expect(body).not.toHaveProperty("databaseUrl");
		expect(body).not.toHaveProperty("directUrl");
		expect(body).not.toHaveProperty("authSecret");
		expect(body).not.toHaveProperty("cronSecret");
	});

	it("caches the database check for five seconds", async () => {
		const { GET } = await loadRoute();
		await GET(request());
		await GET(request());
		expect(queryRaw).toHaveBeenCalledTimes(1);
	});

	it("rate-limits repeated callers", async () => {
		const { GET } = await loadRoute();
		let response = await GET(request("198.51.100.7"));
		for (let attempt = 1; attempt < 60; attempt += 1) {
			response = await GET(request("198.51.100.7"));
		}
		expect(response.status).toBe(200);

		const limited = await GET(request("198.51.100.7"));
		const body = await limited.json();
		expect(limited.status).toBe(429);
		expect(body.error.code).toBe("RATE_LIMITED");
	});

	it("returns 503 when the database check fails", async () => {
		queryRaw.mockRejectedValueOnce(new Error("no connection"));
		const { GET } = await loadRoute();
		const response = await GET(request("192.0.2.55"));
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.status).toBe("degraded");
		expect(body.database).toBe("unreachable");
	});
});
