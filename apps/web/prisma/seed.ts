import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const now = new Date();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function assertDemoTarget() {
	const url = process.env.DATABASE_URL ?? "";
	const local = url.includes("localhost") || url.includes("127.0.0.1") || url.includes("@db:");
	if (!local && process.env.SEED_DEMO !== "yes") {
		throw new Error(
			"Refusing to seed a non-local database. Set SEED_DEMO=yes to acknowledge the target.",
		);
	}
}

function testSamples(base: Date, deviceOffset: number) {
	return Array.from({ length: 18 }, (_, index) => {
		const t = new Date(base.getTime() + (index - 9) * 1000);
		const spike =
			index === 9 ? 3.8 : index === 8 || index === 10 ? 2.9 : 0.15 + Math.random() * 0.2;
		const tilt = index === 9 ? 72 : index === 8 || index === 10 ? 55 : 1 + Math.random() * 3;
		return {
			t,
			accel: Number(spike.toFixed(2)),
			tilt: Number(tilt.toFixed(1)),
		};
	}).map((sample, index) => ({
		id: `demo-sample-${deviceOffset}-${index}`,
		t: sample.t,
		accel: sample.accel,
		tilt: sample.tilt,
	}));
}

async function main() {
	assertDemoTarget();

	const [adminHash, ownerHash, responderHash] = await Promise.all([
		hash("Admin123!", 12),
		hash("Owner123!", 12),
		hash("Responder123!", 12),
	]);

	const org = await prisma.organization.upsert({
		where: { slug: "demo" },
		create: { name: "LifeLink Demo Fleet", slug: "demo" },
		update: { name: "LifeLink Demo Fleet" },
	});

	const [admin, owner, responder] = await Promise.all([
		prisma.user.upsert({
			where: { email: "admin@lifelink.local" },
			create: {
				email: "admin@lifelink.local",
				name: "LifeLink Administrator",
				passwordHash: adminHash,
			},
			update: { name: "LifeLink Administrator", passwordHash: adminHash },
		}),
		prisma.user.upsert({
			where: { email: "owner@lifelink.local" },
			create: {
				email: "owner@lifelink.local",
				name: "Demo Vehicle Owner",
				passwordHash: ownerHash,
			},
			update: { name: "Demo Vehicle Owner", passwordHash: ownerHash },
		}),
		prisma.user.upsert({
			where: { email: "responder@lifelink.local" },
			create: {
				email: "responder@lifelink.local",
				name: "CDRRMO / Pulis Responder",
				passwordHash: responderHash,
			},
			update: { name: "CDRRMO / Pulis Responder", passwordHash: responderHash },
		}),
	]);

	const memberships = [
		{ userId: admin.id, role: "ADMIN" as const },
		{ userId: owner.id, role: "USER" as const },
		{ userId: responder.id, role: "RESPONDER" as const },
	];
	for (const membership of memberships) {
		await prisma.membership.upsert({
			where: { orgId_userId: { orgId: org.id, userId: membership.userId } },
			create: { orgId: org.id, ...membership },
			update: { role: membership.role },
		});
	}

	await prisma.orgSettings.upsert({
		where: { orgId: org.id },
		create: {
			orgId: org.id,
			impactThresholdG: 2.5,
			tiltThresholdDeg: 60,
			confirmWindowMs: 200,
			cancelWindowS: 15,
			heartbeatIntervalS: 30,
			sosRetryS: 60,
			telemetryRetentionDays: 30,
			incidentRetentionDays: 365,
			alertPhones: ["+639171234567"],
			alertEmails: ["ops@lifelink.local"],
		},
		update: {},
	});

	await prisma.emergencyContact.upsert({
		where: { orgId_phone: { orgId: org.id, phone: "+639171234567" } },
		create: {
			orgId: org.id,
			name: "Fleet dispatcher",
			phone: "+639171234567",
			email: "ops@lifelink.local",
		},
		update: { name: "Fleet dispatcher", email: "ops@lifelink.local", active: true },
	});

	const navara = await prisma.vehicle.upsert({
		where: { orgId_plateNo: { orgId: org.id, plateNo: "ABC 1234" } },
		create: {
			orgId: org.id,
			ownerId: owner.id,
			plateNo: "ABC 1234",
			make: "Nissan",
			model: "Navara",
			year: 2021,
			driverName: "Jeff Dela Cruz",
			driverPhone: "+639171234567",
		},
		update: { ownerId: owner.id },
	});

	const hilux = await prisma.vehicle.upsert({
		where: { orgId_plateNo: { orgId: org.id, plateNo: "XYZ 5678" } },
		create: {
			orgId: org.id,
			ownerId: owner.id,
			plateNo: "XYZ 5678",
			make: "Toyota",
			model: "Hilux",
			year: 2019,
			driverName: "Maria Santos",
			driverPhone: "+639181234567",
		},
		update: { ownerId: owner.id },
	});

	// A fleet reserve without an owner: responders and admins see it, the demo
	// vehicle owner does not. It proves the owner scope in the seeded demo.
	await prisma.vehicle.upsert({
		where: { orgId_plateNo: { orgId: org.id, plateNo: "DEF 9012" } },
		create: {
			orgId: org.id,
			plateNo: "DEF 9012",
			make: "Isuzu",
			model: "D-Max",
			year: 2020,
			driverName: "Fleet reserve",
		},
		update: { ownerId: null },
	});

	const navaraDevice = await prisma.trackerDevice.upsert({
		where: { mac: "AA:BB:CC:DD:EE:01" },
		create: {
			orgId: org.id,
			vehicleId: navara.id,
			mac: "AA:BB:CC:DD:EE:01",
			label: "Navara tracker",
			tokenHash: hashToken("llk_demo_navara_token"),
			approvalStatus: "APPROVED",
			firmwareVersion: "0.1.0",
			hwVariant: "devkit-v1",
			lastSeenAt: new Date(now.getTime() - 2 * MINUTE),
			lastLat: 10.3157,
			lastLng: 123.8854,
			lastFixAt: new Date(now.getTime() - 5 * MINUTE),
			lastSpeedKph: 45,
			batteryV: 12.4,
			rssiDbm: -71,
			satellites: 8,
			ignition: true,
			configRev: 0,
		},
		update: {
			vehicleId: navara.id,
			tokenHash: hashToken("llk_demo_navara_token"),
			approvalStatus: "APPROVED",
			lastSeenAt: new Date(now.getTime() - 2 * MINUTE),
		},
	});

	const hiluxDevice = await prisma.trackerDevice.upsert({
		where: { mac: "AA:BB:CC:DD:EE:02" },
		create: {
			orgId: org.id,
			vehicleId: hilux.id,
			mac: "AA:BB:CC:DD:EE:02",
			label: "Hilux tracker",
			tokenHash: hashToken("llk_demo_hilux_token"),
			approvalStatus: "APPROVED",
			firmwareVersion: "0.1.0",
			hwVariant: "devkit-v1",
			lastSeenAt: new Date(now.getTime() - 12 * MINUTE),
			lastLat: 10.2925,
			lastLng: 123.901,
			lastFixAt: new Date(now.getTime() - 18 * MINUTE),
			lastSpeedKph: 0,
			batteryV: 11.8,
			rssiDbm: -89,
			satellites: 4,
			ignition: false,
			configRev: 0,
		},
		update: {
			vehicleId: hilux.id,
			tokenHash: hashToken("llk_demo_hilux_token"),
			approvalStatus: "APPROVED",
			lastSeenAt: new Date(now.getTime() - 12 * MINUTE),
		},
	});

	await prisma.trackerDevice.upsert({
		where: { mac: "AA:BB:CC:DD:EE:03" },
		create: {
			orgId: org.id,
			mac: "AA:BB:CC:DD:EE:03",
			label: "Spare tracker",
			tokenHash: hashToken("llk_demo_spare_token"),
			approvalStatus: "PENDING",
		},
		update: { approvalStatus: "PENDING", label: "Spare tracker" },
	});

	const activeTrip =
		(await prisma.trip.findFirst({
			where: { deviceId: navaraDevice.id, status: "ACTIVE" },
			orderBy: { startedAt: "desc" },
		})) ??
		(await prisma.trip.create({
			data: {
				orgId: org.id,
				vehicleId: navara.id,
				deviceId: navaraDevice.id,
				startedAt: new Date(now.getTime() - 2 * HOUR),
				distanceM: 18_400,
				maxSpeedKph: 78,
				status: "ACTIVE",
			},
		}));

	const incidentAt = new Date(now.getTime() - 3 * HOUR);
	const samples = testSamples(incidentAt, 1);
	const incident = await prisma.impactEvent.upsert({
		where: {
			deviceId_clientIncidentId: {
				deviceId: navaraDevice.id,
				clientIncidentId: "demo-incident-1",
			},
		},
		create: {
			orgId: org.id,
			deviceId: navaraDevice.id,
			vehicleId: navara.id,
			tripId: activeTrip.id,
			clientIncidentId: "demo-incident-1",
			detectedAt: incidentAt,
			peakAccelG: 3.8,
			tiltDeg: 72,
			vibrationCount: 14,
			speedKph: 45,
			lat: 10.3157,
			lng: 123.8854,
			gpsAgeS: 3,
			status: "CONFIRMED",
			cancelDeadline: new Date(incidentAt.getTime() + 15 * 1000),
			evidence: {
				samples: samples.map((sample) => ({
					t: Math.floor(sample.t.getTime() / 1000),
					accel_g: sample.accel,
					tilt_deg: sample.tilt,
				})),
			},
		},
		update: {},
	});

	await prisma.alertDelivery.deleteMany({ where: { impactEventId: incident.id } });
	await prisma.alertDelivery.createMany({
		data: [
			{
				impactEventId: incident.id,
				channel: "SMS",
				target: "+639171234567",
				status: "SENT",
				attempts: 1,
				sentAt: new Date(incidentAt.getTime() + 16 * 1000),
			},
			{
				impactEventId: incident.id,
				channel: "EMAIL",
				target: "ops@lifelink.local",
				status: "QUEUED",
				attempts: 0,
			},
		],
	});

	await prisma.telemetrySample.deleteMany({
		where: { deviceId: navaraDevice.id, clientSampleId: { startsWith: "demo-" } },
	});
	await prisma.telemetrySample.createMany({
		data: samples.map((sample) => ({
			deviceId: navaraDevice.id,
			tripId: activeTrip.id,
			clientSampleId: sample.id,
			recordedAt: sample.t,
			lat: 10.3157 + (Math.random() - 0.5) * 0.002,
			lng: 123.8854 + (Math.random() - 0.5) * 0.002,
			speedKph: 45,
			accelG: sample.accel,
			tiltDeg: sample.tilt,
			vibration: sample.accel > 2.5,
			satellites: 8,
			hdop: 1.2,
			batteryV: 12.4,
			ignition: true,
		})),
		skipDuplicates: true,
	});

	const existingEvent = await prisma.deviceStateEvent.findFirst({
		where: { deviceId: navaraDevice.id, type: "INCIDENT_CONFIRMED" },
	});
	if (!existingEvent) {
		await prisma.deviceStateEvent.create({
			data: {
				deviceId: navaraDevice.id,
				type: "INCIDENT_CONFIRMED",
				metadata: { incidentId: incident.id, source: "demo-seed" },
				createdAt: incidentAt,
			},
		});
	}

	const existingCommand = await prisma.deviceCommand.findFirst({
		where: { deviceId: navaraDevice.id, kind: "LOCATE", status: "PENDING" },
	});
	if (!existingCommand) {
		await prisma.deviceCommand.create({
			data: {
				deviceId: navaraDevice.id,
				kind: "LOCATE",
				payload: { reason: "demo seed" },
				expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
			},
		});
	}

	const existingAudit = await prisma.auditLog.findFirst({
		where: { orgId: org.id, action: "demo.seeded" },
	});
	if (!existingAudit) {
		await prisma.auditLog.create({
			data: {
				orgId: org.id,
				actorId: admin.id,
				action: "demo.seeded",
				target: org.id,
				metadata: { vehicles: 3, devices: 3 },
			},
		});
	}

	console.log("LifeLink demo seed complete.");
	console.log("Admin:         admin@lifelink.local / Admin123!");
	console.log("Vehicle owner: owner@lifelink.local / Owner123!");
	console.log("Responder:     responder@lifelink.local / Responder123!");
	console.log("Navara token: llk_demo_navara_token");
	console.log("Hilux token: llk_demo_hilux_token");
	console.log("Spare token: llk_demo_spare_token");
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
