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
	let userA = "";
	let userB = "";
	let pushA = "";
	let pushB = "";
	let overrideA = "";
	let overrideB = "";
	let membershipA = "";
	let membershipB = "";
	let permissionA = "";
	let permissionB = "";
	let inviteA = "";
	let inviteB = "";
	let platformAdminId = "";

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

		// PushSubscriptions need a real user. These are the only users in the
		// fixture, one per tenant, so the ownership columns are exercised too.
		const ua = await client.user.create({
			data: {
				email: `rls-a-${suffix}@example.test`,
				name: "RLS A user",
				passwordHash: "rls-test-not-a-valid-hash",
			},
		});
		const ub = await client.user.create({
			data: {
				email: `rls-b-${suffix}@example.test`,
				name: "RLS B user",
				passwordHash: "rls-test-not-a-valid-hash",
			},
		});
		userA = ua.id;
		userB = ub.id;
		const platformAdmin = await client.platformAdmin.create({
			data: { userId: userA, createdBy: userA },
		});
		platformAdminId = platformAdmin.id;
		const ma = await client.membership.create({
			data: { orgId: orgA, userId: userA, role: "ADMIN" },
		});
		const mb = await client.membership.create({
			data: { orgId: orgB, userId: userB, role: "ADMIN" },
		});
		membershipA = ma.id;
		membershipB = mb.id;

		const permissionRowA = await client.membershipPermission.create({
			data: { membershipId: membershipA, key: "device.configure", allowed: true },
		});
		const permissionRowB = await client.membershipPermission.create({
			data: { membershipId: membershipB, key: "device.configure", allowed: false },
		});
		permissionA = permissionRowA.id;
		permissionB = permissionRowB.id;

		const inviteRowA = await client.invitationToken.create({
			data: {
				orgId: orgA,
				email: `rls-invite-a-${suffix}@example.test`,
				role: "USER",
				tokenHash: `rls-invite-hash-a-${suffix}`,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
				createdById: userA,
			},
		});
		const inviteRowB = await client.invitationToken.create({
			data: {
				orgId: orgB,
				email: `rls-invite-b-${suffix}@example.test`,
				role: "USER",
				tokenHash: `rls-invite-hash-b-${suffix}`,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
				createdById: userB,
			},
		});
		inviteA = inviteRowA.id;
		inviteB = inviteRowB.id;

		const pa = await client.pushSubscription.create({
			data: {
				userId: userA,
				orgId: orgA,
				endpoint: `https://push.example.test/rls-a-${suffix}`,
				p256dh: "B".repeat(87),
				auth: "a".repeat(22),
				locale: "en",
			},
		});
		const pb = await client.pushSubscription.create({
			data: {
				userId: userB,
				orgId: orgB,
				endpoint: `https://push.example.test/rls-b-${suffix}`,
				p256dh: "C".repeat(87),
				auth: "b".repeat(22),
				locale: "en",
			},
		});
		pushA = pa.id;
		pushB = pb.id;

		const oa = await client.deviceConfigOverride.create({
			data: { deviceId: deviceA, orgId: orgA, cancelWindowS: 60 },
		});
		const ob = await client.deviceConfigOverride.create({
			data: { deviceId: deviceB, orgId: orgB, cancelWindowS: 45 },
		});
		overrideA = oa.id;
		overrideB = ob.id;
	});

	afterAll(async () => {
		const client = prisma;
		if (!client) return;
		const ids = [orgA, orgB].filter(Boolean);
		if (ids.length > 0) {
			// PushSubscription, DeviceConfigOverride, Membership and the rest
			// cascade from Organization.
			await client.organization.deleteMany({ where: { id: { in: ids } } });
		}
		const userIds = [userA, userB].filter(Boolean);
		if (userIds.length > 0) {
			await client.user.deleteMany({ where: { id: { in: userIds } } });
		}
		const leftoverOverrides = await client.deviceConfigOverride.count({
			where: { id: { in: [overrideA, overrideB].filter(Boolean) } },
		});
		expect(leftoverOverrides).toBe(0);
		const leftoverPermissions = await client.membershipPermission.count({
			where: { id: { in: [permissionA, permissionB].filter(Boolean) } },
		});
		expect(leftoverPermissions).toBe(0);
		const leftoverInvites = await client.invitationToken.count({
			where: { id: { in: [inviteA, inviteB].filter(Boolean) } },
		});
		expect(leftoverInvites).toBe(0);
		const leftoverPlatformAdmins = await client.platformAdmin.count({
			where: { id: platformAdminId || "__none__" },
		});
		expect(leftoverPlatformAdmins).toBe(0);
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

	it("sees only the current organization's push subscriptions", async () => {
		const a = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PushSubscription" ORDER BY "id"`,
		);
		expect(a.map((row) => row.id)).toEqual([pushA]);

		const b = await asTenant(
			orgB,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PushSubscription" ORDER BY "id"`,
		);
		expect(b.map((row) => row.id)).toEqual([pushB]);
	});

	it("cannot update or delete another organization's push subscription", async () => {
		const updated = await asTenant(
			orgA,
			(tx) =>
				tx.$executeRaw`UPDATE "PushSubscription" SET "locale" = ${"tl"} WHERE "id" = ${pushB}`,
		);
		expect(updated).toBe(0);

		const deleted = await asTenant(
			orgA,
			(tx) => tx.$executeRaw`DELETE FROM "PushSubscription" WHERE "id" = ${pushB}`,
		);
		expect(deleted).toBe(0);

		const still = await db().pushSubscription.findUnique({ where: { id: pushB } });
		expect(still?.locale).toBe("en");
	});

	it("rejects a push subscription inserted for another organization", async () => {
		await expect(
			asTenant(
				orgA,
				(tx) => tx.$executeRaw`
					INSERT INTO "PushSubscription"
						("id", "userId", "orgId", "endpoint", "p256dh", "auth", "locale", "updatedAt")
					VALUES (
						${`rls-push-${Date.now()}-${Math.random().toString(36).slice(2)}`},
						${userA},
						${orgB},
						${`https://push.example.test/rls-x-${Date.now()}`},
						${"D".repeat(87)},
						${"c".repeat(22)},
						${"en"},
						${new Date()}
					)
				`,
			),
		).rejects.toThrow();
	});

	it("sees only the current organization's device config overrides", async () => {
		const a = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "DeviceConfigOverride" ORDER BY "id"`,
		);
		expect(a.map((row) => row.id)).toEqual([overrideA]);

		const b = await asTenant(
			orgB,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "DeviceConfigOverride" ORDER BY "id"`,
		);
		expect(b.map((row) => row.id)).toEqual([overrideB]);
	});

	it("cannot update or delete another organization's device config override", async () => {
		const updated = await asTenant(
			orgA,
			(tx) =>
				tx.$executeRaw`UPDATE "DeviceConfigOverride" SET "cancelWindowS" = ${5} WHERE "id" = ${overrideB}`,
		);
		expect(updated).toBe(0);

		const deleted = await asTenant(
			orgA,
			(tx) => tx.$executeRaw`DELETE FROM "DeviceConfigOverride" WHERE "id" = ${overrideB}`,
		);
		expect(deleted).toBe(0);

		const still = await db().deviceConfigOverride.findUnique({ where: { id: overrideB } });
		expect(still?.cancelWindowS).toBe(45);
	});

	it("sees only the current organization's membership permissions", async () => {
		const a = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MembershipPermission" ORDER BY "id"`,
		);
		expect(a.map((row) => row.id)).toEqual([permissionA]);

		const b = await asTenant(
			orgB,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MembershipPermission" ORDER BY "id"`,
		);
		expect(b.map((row) => row.id)).toEqual([permissionB]);
	});

	it("cannot update or delete another organization's membership permission", async () => {
		const updated = await asTenant(
			orgA,
			(tx) =>
				tx.$executeRaw`UPDATE "MembershipPermission" SET "allowed" = ${true} WHERE "id" = ${permissionB}`,
		);
		expect(updated).toBe(0);

		const deleted = await asTenant(
			orgA,
			(tx) => tx.$executeRaw`DELETE FROM "MembershipPermission" WHERE "id" = ${permissionB}`,
		);
		expect(deleted).toBe(0);

		const still = await db().membershipPermission.findUnique({ where: { id: permissionB } });
		expect(still?.allowed).toBe(false);
	});

	it("sees only the current organization's invitation tokens", async () => {
		const a = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InvitationToken" ORDER BY "id"`,
		);
		expect(a.map((row) => row.id)).toEqual([inviteA]);

		const b = await asTenant(
			orgB,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InvitationToken" ORDER BY "id"`,
		);
		expect(b.map((row) => row.id)).toEqual([inviteB]);
	});

	it("cannot update or delete another organization's invitation token", async () => {
		const updated = await asTenant(
			orgA,
			(tx) =>
				tx.$executeRaw`UPDATE "InvitationToken" SET "email" = ${"hacked@example.test"} WHERE "id" = ${inviteB}`,
		);
		expect(updated).toBe(0);

		const deleted = await asTenant(
			orgA,
			(tx) => tx.$executeRaw`DELETE FROM "InvitationToken" WHERE "id" = ${inviteB}`,
		);
		expect(deleted).toBe(0);

		const still = await db().invitationToken.findUnique({ where: { id: inviteB } });
		expect(still?.email).toContain("rls-invite-b-");
	});

	it("rejects an invitation token inserted for another organization", async () => {
		await expect(
			asTenant(
				orgA,
				(tx) => tx.$executeRaw`
					INSERT INTO "InvitationToken"
						("id", "orgId", "email", "role", "tokenHash", "expiresAt", "createdById", "createdAt")
					VALUES (
						${`rls-invite-x-${Date.now()}-${Math.random().toString(36).slice(2)}`},
						${orgB},
						${"x@example.test"},
						${"USER"}::"MemberRole",
						${`rls-invite-hash-x-${Date.now()}`},
						${new Date(Date.now() + 86_400_000)},
						${userA},
						${new Date()}
					)
				`,
			),
		).rejects.toThrow();
	});

	it("rejects a permission override for another organization's membership", async () => {
		await expect(
			asTenant(
				orgA,
				(tx) => tx.$executeRaw`
					INSERT INTO "MembershipPermission"
						("id", "membershipId", "key", "allowed", "updatedAt")
					VALUES (
						${`rls-permission-x-${Date.now()}-${Math.random().toString(36).slice(2)}`},
						${membershipB},
						${"device.configure"},
						${true},
						${new Date()}
					)
				`,
			),
		).rejects.toThrow();
	});

	it("keeps the global platform administrator table out of every tenant", async () => {
		// The owner sees the row. A tenant role sees nothing: either the query
		// is denied (no grant) or the deny-all policy returns no rows.
		expect(await db().platformAdmin.count()).toBeGreaterThan(0);

		const visible = await asTenant(
			orgA,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PlatformAdmin"`,
		)
			.then((rows) => rows.length)
			.catch(() => 0);
		expect(visible).toBe(0);

		const policies = await db().$queryRaw<
			{ polname: string; qual: string | null; withcheck: string | null }[]
		>`
			SELECT polname,
			       pg_get_expr(polqual, polrelid) AS qual,
			       pg_get_expr(polwithcheck, polrelid) AS withcheck
			FROM pg_policy
			WHERE polrelid = '"PlatformAdmin"'::regclass
		`;
		expect(
			policies.some(
				(policy) =>
					policy.polname === "platform_admin_owner_only" &&
					policy.qual?.toLowerCase().includes("false") === true &&
					policy.withcheck?.toLowerCase().includes("false") === true,
			),
		).toBe(true);

		// userB has no PlatformAdmin row, so a unique-index failure cannot be
		// mistaken for the RLS denial.
		let insertError: unknown;
		try {
			await asTenant(
				orgA,
				(tx) => tx.$executeRaw`
					INSERT INTO "PlatformAdmin" ("id", "userId")
					VALUES (
						${`rls-platform-x-${Date.now()}-${Math.random().toString(36).slice(2)}`},
						${userB}
					)
				`,
			);
		} catch (error) {
			insertError = error;
		}

		expect(insertError).toBeDefined();
		const message = insertError instanceof Error ? insertError.message : String(insertError);
		expect(message.toLowerCase()).not.toContain("duplicate key");
		expect(message.toLowerCase()).toMatch(/row-level security|permission denied/);
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

		const subscriptions = await asTenant(
			null,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PushSubscription"`,
		);
		expect(subscriptions).toHaveLength(0);

		const overrides = await asTenant(
			null,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "DeviceConfigOverride"`,
		);
		expect(overrides).toHaveLength(0);

		const permissions = await asTenant(
			null,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MembershipPermission"`,
		);
		expect(permissions).toHaveLength(0);

		const invites = await asTenant(
			null,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InvitationToken"`,
		);
		expect(invites).toHaveLength(0);

		const platformAdmins = await asTenant(
			null,
			(tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PlatformAdmin"`,
		)
			.then((rows) => rows.length)
			.catch(() => 0);
		expect(platformAdmins).toBe(0);
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
