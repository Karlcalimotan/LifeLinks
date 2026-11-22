// @vitest-environment node
import { type Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RLS_TEST_ALLOW === "1" && Boolean(process.env.RLS_TEST_DATABASE_URL);
const describeRls = enabled ? describe : describe.skip;

describeRls("RLS organization isolation", () => {
	let prisma: PrismaClient | undefined;
	let orgA = "";
	let orgB = "";
	let vehicleA = "";
	let vehicleB = "";
	let impactA = "";
	let impactB = "";
	let deviceA = "";
	let deviceB = "";

	function db() {
		if (!prisma) throw new Error("RLS test database is not initialized");
		return prisma;
	}

	async function asTenant<T>(
		orgId: string | null,
		fn: (tx: Prisma.TransactionClient) => Promise<T>,
	): Promise<T> {
		return db().$transaction(async (tx) => {
			await tx.$executeRawUnsafe("SET LOCAL ROLE lifelink_rls_test");
			if (orgId !== null) {
				await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
			}
			return fn(tx);
		});
	}

	beforeAll(async () => {
		const url = process.env.RLS_TEST_DATABASE_URL;
		if (!url) throw new Error("RLS_TEST_DATABASE_URL is required");
		const client = new PrismaClient({ datasources: { db: { url } } });
		prisma = client;

		const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const a = await client.organization.create({
			data: { name: "RLS A", slug: `rls-a-${suffix}` },
		});
		const b = await client.organization.create({
			data: { name: "RLS B", slug: `rls-b-${suffix}` },
		});
		orgA = a.id;
		orgB = b.id;

		const da = await client.trackerDevice.create({
			data: {
				orgId: orgA,
				mac: `rls-a-${suffix}`,
				label: "RLS A device",
				tokenHash: `rls-a-${suffix}`,
			},
		});
		const dbDevice = await client.trackerDevice.create({
			data: {
				orgId: orgB,
				mac: `rls-b-${suffix}`,
				label: "RLS B device",
				tokenHash: `rls-b-${suffix}`,
			},
		});
		deviceA = da.id;
		deviceB = dbDevice.id;

		const va = await client.vehicle.create({
			data: { orgId: orgA, plateNo: "RLS-A", make: "Test", model: "A" },
		});
		const vb = await client.vehicle.create({
			data: { orgId: orgB, plateNo: "RLS-B", make: "Test", model: "B" },
		});
		vehicleA = va.id;
		vehicleB = vb.id;

		const ia = await client.impactEvent.create({
			data: {
				orgId: orgA,
				deviceId: deviceA,
				vehicleId: vehicleA,
				clientIncidentId: `rls-a-${suffix}`,
				detectedAt: new Date(),
				peakAccelG: 3,
				tiltDeg: 70,
			},
		});
		const ib = await client.impactEvent.create({
			data: {
				orgId: orgB,
				deviceId: deviceB,
				vehicleId: vehicleB,
				clientIncidentId: `rls-b-${suffix}`,
				detectedAt: new Date(),
				peakAccelG: 3,
				tiltDeg: 70,
			},
		});
		impactA = ia.id;
		impactB = ib.id;

		await client.orgSettings.create({ data: { orgId: orgA } });
		await client.orgSettings.create({ data: { orgId: orgB } });
	});

	afterAll(async () => {
		const client = prisma;
		if (!client) return;
		const ids = [orgA, orgB].filter(Boolean);
		if (ids.length > 0) {
			await client.organization.deleteMany({ where: { id: { in: ids } } });
		}
		await client.$disconnect();
	});

	it("runs as the non-owner test role", async () => {
		const rows = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`,
		);
		expect(rows[0]?.role).toBe("lifelink_rls_test");
	});

	it("sees only the current organization's vehicles", async () => {
		const rows = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Vehicle" ORDER BY "id"`,
		);
		expect(rows.map((row) => row.id)).toEqual([vehicleA]);
	});

	it("sees only the current organization's devices, incidents and settings", async () => {
		const devices = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "TrackerDevice" ORDER BY "id"`,
		);
		expect(devices.map((row) => row.id)).toEqual([deviceA]);

		const impacts = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ImpactEvent" ORDER BY "id"`,
		);
		expect(impacts.map((row) => row.id)).toEqual([impactA]);

		const settings = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ orgId: string }[]>`SELECT "orgId" FROM "OrgSettings" ORDER BY "orgId"`,
		);
		expect(settings.map((row) => row.orgId)).toEqual([orgA]);
	});

	it("cannot update or delete another organization's vehicle", async () => {
		const updated = await asTenant(
			orgA,
			(tx) => tx.$executeRaw`UPDATE "Vehicle" SET "plateNo" = ${"HACKED"} WHERE "id" = ${vehicleB}`,
		);
		expect(updated).toBe(0);

		const deleted = await asTenant(
			orgA,
			(tx) => tx.$executeRaw`DELETE FROM "Vehicle" WHERE "id" = ${vehicleB}`,
		);
		expect(deleted).toBe(0);

		const still = await db().vehicle.findUnique({ where: { id: vehicleB } });
		expect(still).not.toBeNull();
	});

	it("fails closed when no organization is set", async () => {
		const vehicles = await asTenant(
			null,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Vehicle"`,
		);
		expect(vehicles).toHaveLength(0);

		const incidents = await asTenant(
			null,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ImpactEvent"`,
		);
		expect(incidents).toHaveLength(0);
	});

	it("rejects an insert when no organization is set", async () => {
		await expect(
			asTenant(
				null,
				(tx) => tx.$executeRaw`
					INSERT INTO "Vehicle" ("id", "orgId", "plateNo", "make", "model", "updatedAt")
					VALUES (
						${`rls-insert-${Date.now()}-${Math.random().toString(36).slice(2)}`},
						${orgA},
						${"RLS-X"},
						${"Test"},
						${"X"},
						${new Date()}
					)
				`,
			),
		).rejects.toThrow();
	});

	it("keeps the second organization invisible without a setting", async () => {
		// `impactB` and `vehicleB` exist as the owner, but a tenant transaction
		// for orgA must not see them.
		const rows = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Vehicle" WHERE "id" = ${vehicleB}`,
		);
		expect(rows).toHaveLength(0);
		expect(impactB).not.toBe(impactA);
	});
});
