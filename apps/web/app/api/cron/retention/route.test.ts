// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	orgSettingsFindMany: vi.fn(),
	telemetryFindMany: vi.fn(),
	telemetryDeleteMany: vi.fn(),
	telemetryCount: vi.fn(),
	impactFindMany: vi.fn(),
	impactDeleteMany: vi.fn(),
	impactCount: vi.fn(),
	alertDeleteMany: vi.fn(),
	alertCount: vi.fn(),
	auditCreate: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		orgSettings: { findMany: mocks.orgSettingsFindMany },
		telemetrySample: {
			findMany: mocks.telemetryFindMany,
			deleteMany: mocks.telemetryDeleteMany,
			count: mocks.telemetryCount,
		},
		impactEvent: {
			findMany: mocks.impactFindMany,
			deleteMany: mocks.impactDeleteMany,
			count: mocks.impactCount,
		},
		alertDelivery: {
			deleteMany: mocks.alertDeleteMany,
			count: mocks.alertCount,
		},
		auditLog: { create: mocks.auditCreate },
		$transaction: mocks.transaction,
	},
}));

import { GET } from "./route";

const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET = "test-cron-secret-value";
const originalSecret = process.env.CRON_SECRET;

interface OrgSettingsRow {
	orgId: string;
	telemetryRetentionDays: number;
	incidentRetentionDays: number;
}

function request(options: { authorization?: string | null; dryRun?: boolean } = {}) {
	const headers = new Headers();
	if (options.authorization !== null && options.authorization !== undefined) {
		headers.set("authorization", options.authorization);
	}
	const suffix = options.dryRun ? "?dryRun=1" : "";
	return new Request(`http://localhost/api/cron/retention${suffix}`, { headers });
}

function authorized(dryRun = false) {
	return request({ authorization: `Bearer ${SECRET}`, dryRun });
}

function settings(rows: OrgSettingsRow[]) {
	mocks.orgSettingsFindMany.mockResolvedValue(rows);
}

beforeEach(() => {
	vi.resetAllMocks();
	Reflect.deleteProperty(process.env, "CRON_SECRET");

	mocks.transaction.mockImplementation((operations: Array<Promise<unknown>>) =>
		Promise.all(operations),
	);
	mocks.telemetryFindMany.mockResolvedValue([]);
	mocks.telemetryDeleteMany.mockResolvedValue({ count: 0 });
	mocks.telemetryCount.mockResolvedValue(0);
	mocks.impactFindMany.mockResolvedValue([]);
	mocks.impactDeleteMany.mockResolvedValue({ count: 0 });
	mocks.impactCount.mockResolvedValue(0);
	mocks.alertDeleteMany.mockResolvedValue({ count: 0 });
	mocks.alertCount.mockResolvedValue(0);
	mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
	settings([{ orgId: "org-a", telemetryRetentionDays: 30, incidentRetentionDays: 365 }]);
});

afterAll(() => {
	if (originalSecret === undefined) {
		Reflect.deleteProperty(process.env, "CRON_SECRET");
	} else {
		process.env.CRON_SECRET = originalSecret;
	}
});

describe("GET /api/cron/retention authorization", () => {
	it("fails closed with 503 when CRON_SECRET is unset and touches nothing", async () => {
		const response = await GET(authorized());
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.error.code).toBe("INTERNAL");
		expect(mocks.orgSettingsFindMany).not.toHaveBeenCalled();
		expect(mocks.telemetryFindMany).not.toHaveBeenCalled();
		expect(mocks.impactFindMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("rejects a wrong or missing secret with 401 and touches nothing", async () => {
		process.env.CRON_SECRET = SECRET;

		for (const headers of [
			request(),
			request({ authorization: "Bearer wrong-secret" }),
			request({ authorization: `Bearer ${SECRET}suffix` }),
			request({ authorization: SECRET }),
		]) {
			const response = await GET(headers);
			const text = await response.text();
			expect(response.status).toBe(401);
			expect(text).toContain("UNAUTHORIZED");
			expect(text).not.toContain(SECRET);
		}

		expect(mocks.orgSettingsFindMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it("runs with the correct secret and never echoes it", async () => {
		process.env.CRON_SECRET = SECRET;
		const response = await GET(authorized());
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(text).not.toContain(SECRET);
		expect(text.toLowerCase()).not.toContain("authorization");
		expect(mocks.orgSettingsFindMany).toHaveBeenCalledTimes(1);
		expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
	});
});

describe("GET /api/cron/retention cutoffs", () => {
	it("computes each cutoff from that organisation's settings and uses it in the query", async () => {
		process.env.CRON_SECRET = SECRET;
		settings([
			{ orgId: "org-a", telemetryRetentionDays: 7, incidentRetentionDays: 30 },
			{ orgId: "org-b", telemetryRetentionDays: 365, incidentRetentionDays: 1 },
		]);

		const before = Date.now();
		const response = await GET(authorized());
		const after = Date.now();
		const body = await response.json();

		expect(response.status).toBe(200);
		const [first, second] = body.data.organisations;
		const expected = [
			{ telemetry: 7, incident: 30 },
			{ telemetry: 365, incident: 1 },
		];
		for (const [index, organisation] of body.data.organisations.entries()) {
			const telemetryCutoff = Date.parse(organisation.telemetry.cutoff);
			const incidentCutoff = Date.parse(organisation.incidents.cutoff);
			expect(telemetryCutoff).toBeGreaterThanOrEqual(
				before - expected[index].telemetry * DAY_MS - 1_000,
			);
			expect(telemetryCutoff).toBeLessThanOrEqual(
				after - expected[index].telemetry * DAY_MS + 1_000,
			);
			expect(incidentCutoff).toBeGreaterThanOrEqual(
				before - expected[index].incident * DAY_MS - 1_000,
			);
			expect(incidentCutoff).toBeLessThanOrEqual(after - expected[index].incident * DAY_MS + 1_000);
		}
		expect(first.orgId).toBe("org-a");
		expect(second.orgId).toBe("org-b");

		const telemetryArgs = mocks.telemetryFindMany.mock.calls.map((call) => call[0]);
		expect(telemetryArgs[0].where.recordedAt.lt.toISOString()).toBe(first.telemetry.cutoff);
		expect(telemetryArgs[0].where.device.orgId).toBe("org-a");
		expect(telemetryArgs[1].where.recordedAt.lt.toISOString()).toBe(second.telemetry.cutoff);
		expect(telemetryArgs[1].where.device.orgId).toBe("org-b");

		const incidentArgs = mocks.impactFindMany.mock.calls.map((call) => call[0]);
		expect(incidentArgs[0].where.createdAt.lt.toISOString()).toBe(first.incidents.cutoff);
		expect(incidentArgs[1].where.createdAt.lt.toISOString()).toBe(second.incidents.cutoff);
	});

	it("skips a corrupt non-positive period instead of deleting everything", async () => {
		process.env.CRON_SECRET = SECRET;
		settings([{ orgId: "org-bad", telemetryRetentionDays: 0, incidentRetentionDays: -5 }]);

		const response = await GET(authorized());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.organisations[0].telemetry.cutoff).toBeNull();
		expect(body.data.organisations[0].incidents.cutoff).toBeNull();
		expect(body.data.totals).toEqual({
			telemetryDeleted: 0,
			incidentsDeleted: 0,
			alertDeliveriesDeleted: 0,
		});
		expect(mocks.telemetryFindMany).not.toHaveBeenCalled();
		expect(mocks.impactFindMany).not.toHaveBeenCalled();
		expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
	});
});

describe("GET /api/cron/retention deletion", () => {
	it("keeps recent rows and deletes only rows older than the cutoff", async () => {
		process.env.CRON_SECRET = SECRET;
		const now = Date.now();
		const rows = [
			{ id: "old-sample", recordedAt: new Date(now - 31 * DAY_MS) },
			{ id: "recent-sample", recordedAt: new Date(now - 29 * DAY_MS) },
		];
		mocks.telemetryFindMany.mockImplementation(
			(args: { where: { recordedAt: { lt: Date } }; take: number }) =>
				rows
					.filter((row) => row.recordedAt < args.where.recordedAt.lt)
					.slice(0, args.take)
					.map((row) => ({ id: row.id })),
		);
		mocks.telemetryDeleteMany.mockImplementation((args: { where: { id: { in: string[] } } }) => {
			const ids = new Set(args.where.id.in);
			const removed = rows.filter((row) => ids.has(row.id)).length;
			for (let index = rows.length - 1; index >= 0; index -= 1) {
				const row = rows[index];
				if (row && ids.has(row.id)) rows.splice(index, 1);
			}
			return Promise.resolve({ count: removed });
		});

		const response = await GET(authorized());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.organisations[0].telemetry.deleted).toBe(1);
		expect(rows.map((row) => row.id)).toEqual(["recent-sample"]);
		expect(mocks.telemetryDeleteMany).toHaveBeenCalledTimes(1);
		expect(mocks.telemetryDeleteMany.mock.calls[0][0].where.id.in).toEqual(["old-sample"]);
	});

	it("deletes alert deliveries and incidents in one batch transaction", async () => {
		process.env.CRON_SECRET = SECRET;
		mocks.impactFindMany.mockResolvedValueOnce([{ id: "impact-1" }, { id: "impact-2" }]);
		mocks.alertDeleteMany.mockResolvedValue({ count: 3 });
		mocks.impactDeleteMany.mockResolvedValue({ count: 2 });

		const response = await GET(authorized());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.alertDeleteMany).toHaveBeenCalledWith({
			where: { impactEventId: { in: ["impact-1", "impact-2"] } },
		});
		expect(mocks.impactDeleteMany).toHaveBeenCalledWith({
			where: { id: { in: ["impact-1", "impact-2"] } },
		});
		expect(body.data.organisations[0].incidents).toMatchObject({
			deleted: 2,
			alertDeliveriesDeleted: 3,
			batches: 1,
			truncated: false,
		});
	});

	it("stops at the maximum batch count for both tables and reports truncation", async () => {
		process.env.CRON_SECRET = SECRET;
		const fullBatch = Array.from({ length: 5_000 }, (_, index) => ({ id: `sample-${index}` }));
		mocks.telemetryFindMany.mockResolvedValue(fullBatch);
		mocks.telemetryDeleteMany.mockResolvedValue({ count: 5_000 });
		mocks.impactFindMany.mockResolvedValue(fullBatch);
		mocks.impactDeleteMany.mockResolvedValue({ count: 5_000 });
		mocks.alertDeleteMany.mockResolvedValue({ count: 7_500 });

		const response = await GET(authorized());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.telemetryFindMany).toHaveBeenCalledTimes(20);
		expect(mocks.telemetryDeleteMany).toHaveBeenCalledTimes(20);
		expect(mocks.telemetryFindMany.mock.calls[0][0].take).toBe(5_000);
		expect(body.data.organisations[0].telemetry).toMatchObject({
			deleted: 100_000,
			batches: 20,
			truncated: true,
		});

		expect(mocks.impactFindMany).toHaveBeenCalledTimes(20);
		expect(mocks.impactFindMany.mock.calls[0][0].take).toBe(5_000);
		expect(mocks.transaction).toHaveBeenCalledTimes(20);
		expect(body.data.organisations[0].incidents).toMatchObject({
			deleted: 100_000,
			alertDeliveriesDeleted: 150_000,
			batches: 20,
			truncated: true,
		});
	});
});

describe("GET /api/cron/retention dry run", () => {
	it("reports counts without deleting anything", async () => {
		process.env.CRON_SECRET = SECRET;
		mocks.telemetryCount.mockResolvedValue(42);
		mocks.impactCount.mockResolvedValue(7);
		mocks.alertCount.mockResolvedValue(9);

		const response = await GET(authorized(true));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.dryRun).toBe(true);
		expect(body.data.totals).toEqual({
			telemetryDeleted: 42,
			incidentsDeleted: 7,
			alertDeliveriesDeleted: 9,
		});
		expect(mocks.telemetryFindMany).not.toHaveBeenCalled();
		expect(mocks.telemetryDeleteMany).not.toHaveBeenCalled();
		expect(mocks.impactFindMany).not.toHaveBeenCalled();
		expect(mocks.impactDeleteMany).not.toHaveBeenCalled();
		expect(mocks.alertDeleteMany).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();

		const audit = mocks.auditCreate.mock.calls[0][0].data;
		expect(audit.metadata).toMatchObject({
			dryRun: true,
			telemetryDeleted: 42,
			incidentsDeleted: 7,
			alertDeliveriesDeleted: 9,
			telemetryBatches: 0,
			incidentBatches: 0,
			truncated: false,
		});
	});

	it("still requires the secret", async () => {
		process.env.CRON_SECRET = SECRET;
		const response = await GET(request({ authorization: "Bearer wrong", dryRun: true }));
		expect(response.status).toBe(401);
		expect(mocks.telemetryCount).not.toHaveBeenCalled();
		expect(mocks.impactCount).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});
});

describe("GET /api/cron/retention audit", () => {
	it("writes one audit row per organisation with cutoffs and counts only", async () => {
		process.env.CRON_SECRET = SECRET;
		settings([
			{ orgId: "org-a", telemetryRetentionDays: 30, incidentRetentionDays: 365 },
			{ orgId: "org-b", telemetryRetentionDays: 10, incidentRetentionDays: 90 },
		]);
		mocks.telemetryFindMany.mockResolvedValue([{ id: "t-1" }]);
		mocks.telemetryDeleteMany.mockResolvedValue({ count: 1 });
		mocks.impactFindMany.mockResolvedValue([{ id: "i-1" }]);
		mocks.impactDeleteMany.mockResolvedValue({ count: 1 });
		mocks.alertDeleteMany.mockResolvedValue({ count: 2 });

		const response = await GET(authorized());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.auditCreate).toHaveBeenCalledTimes(2);

		for (const [index, organisation] of body.data.organisations.entries()) {
			const data = mocks.auditCreate.mock.calls[index][0].data;
			expect(data.action).toBe("retention.cleanup");
			expect(data.orgId).toBe(organisation.orgId);
			expect(data.target).toBe(organisation.orgId);
			expect(data.actorId).toBeUndefined();
			expect(data.metadata).toEqual({
				dryRun: false,
				telemetryRetentionDays: index === 0 ? 30 : 10,
				incidentRetentionDays: index === 0 ? 365 : 90,
				telemetryCutoff: organisation.telemetry.cutoff,
				incidentCutoff: organisation.incidents.cutoff,
				telemetryDeleted: 1,
				incidentsDeleted: 1,
				alertDeliveriesDeleted: 2,
				telemetryBatches: 1,
				incidentBatches: 1,
				truncated: false,
			});
			expect(Object.keys(data.metadata).sort()).toEqual([
				"alertDeliveriesDeleted",
				"dryRun",
				"incidentBatches",
				"incidentCutoff",
				"incidentRetentionDays",
				"incidentsDeleted",
				"telemetryBatches",
				"telemetryCutoff",
				"telemetryDeleted",
				"telemetryRetentionDays",
				"truncated",
			]);
			const serialized = JSON.stringify(data.metadata);
			for (const forbidden of ["phone", "lat", "lng", "plate", "evidence", SECRET]) {
				expect(serialized).not.toContain(forbidden);
			}
		}
	});
});
