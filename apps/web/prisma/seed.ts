import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import {
	type FirmwareConfigValues,
	buildFirmwareConfig,
	configRevision,
} from "../lib/firmware/config";
import { assertSeedTarget } from "../lib/seed/guard";

const prisma = new PrismaClient();
const now = new Date();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Every timestamp below is relative to the seed run so screenshots stay current. */
const ago = (ms: number) => new Date(now.getTime() - ms);

/**
 * The demo organisation runs the default firmware configuration. The revision
 * is computed with the same helper the app uses, so a seeded tracker can show
 * the confirmed state without a fabricated number.
 */
const DEMO_ORG_CONFIG: FirmwareConfigValues = {
	impactThresholdG: 2.5,
	tiltThresholdDeg: 60,
	confirmWindowMs: 200,
	cancelWindowS: 15,
	heartbeatIntervalS: 30,
	sosRetryS: 60,
};
const DEMO_CONFIG_REV = configRevision(DEMO_ORG_CONFIG);

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function assertDemoTarget() {
	assertSeedTarget();
}

// --- Demo fleet -----------------------------------------------------------
// Fictional vehicles, drivers and plates. MACs use real Espressif OUIs and
// unique suffixes; nothing here is a person's real registration.

type VehicleKey =
	| "navara"
	| "hilux"
	| "dmax"
	| "l300"
	| "innova"
	| "ranger"
	| "ertiga"
	| "h350"
	| "vios"
	| "fortuner"
	| "montero";

interface VehicleSeed {
	key: VehicleKey;
	plateNo: string;
	make: string;
	model: string;
	year: number;
	owner: boolean;
	driverName: string;
	driverPhone: string;
	status: "ACTIVE" | "MAINTENANCE";
}

const VEHICLES: VehicleSeed[] = [
	{
		key: "navara",
		plateNo: "NDR 4821",
		make: "Nissan",
		model: "Navara",
		year: 2021,
		owner: true,
		driverName: "Ramon Villaflor",
		driverPhone: "+639173884216",
		status: "ACTIVE",
	},
	{
		key: "hilux",
		plateNo: "FAA 7315",
		make: "Toyota",
		model: "Hilux",
		year: 2019,
		owner: true,
		driverName: "Ma. Lourdes Causing",
		driverPhone: "+639184520937",
		status: "ACTIVE",
	},
	{
		key: "dmax",
		plateNo: "KAB 9084",
		make: "Isuzu",
		model: "D-Max",
		year: 2020,
		owner: false,
		driverName: "Arnel Tupas",
		driverPhone: "+639195608342",
		status: "ACTIVE",
	},
	{
		key: "l300",
		plateNo: "LTA 3175",
		make: "Mitsubishi",
		model: "L300",
		year: 2018,
		owner: false,
		driverName: "Rodel Suarez",
		driverPhone: "+639206417285",
		status: "MAINTENANCE",
	},
	{
		key: "innova",
		plateNo: "NGA 6402",
		make: "Toyota",
		model: "Innova",
		year: 2022,
		owner: true,
		driverName: "Editha Montelibano",
		driverPhone: "+639217832604",
		status: "ACTIVE",
	},
	{
		key: "ranger",
		plateNo: "CAK 5528",
		make: "Ford",
		model: "Ranger",
		year: 2021,
		owner: false,
		driverName: "Dennis Ledesma",
		driverPhone: "+639228965471",
		status: "ACTIVE",
	},
	{
		key: "ertiga",
		plateNo: "MAB 2147",
		make: "Suzuki",
		model: "Ertiga",
		year: 2019,
		owner: false,
		driverName: "Joselito Azucena",
		driverPhone: "+639239174028",
		status: "ACTIVE",
	},
	{
		key: "h350",
		plateNo: "PDA 8630",
		make: "Hyundai",
		model: "H350",
		year: 2020,
		owner: false,
		driverName: "Federico Salcedo",
		driverPhone: "+639241058693",
		status: "MAINTENANCE",
	},
	{
		key: "vios",
		plateNo: "PBA 4719",
		make: "Toyota",
		model: "Vios",
		year: 2023,
		owner: false,
		driverName: "Marlon Estrella",
		driverPhone: "+639252740186",
		status: "ACTIVE",
	},
	{
		key: "fortuner",
		plateNo: "NAA 8163",
		make: "Toyota",
		model: "Fortuner",
		year: 2021,
		owner: false,
		driverName: "Cristina Hofileña",
		driverPhone: "+639263518904",
		status: "ACTIVE",
	},
	{
		key: "montero",
		plateNo: "CAA 2906",
		make: "Mitsubishi",
		model: "Montero Sport",
		year: 2020,
		owner: false,
		driverName: "Noel Ancajas",
		driverPhone: "+639274602318",
		status: "ACTIVE",
	},
];

interface TrackerSeed {
	key: string;
	vehicle: VehicleKey | null;
	mac: string;
	label: string;
	token: string;
	approvalStatus: "APPROVED" | "PENDING" | "REJECTED";
	firmwareVersion: string | null;
	hwVariant: string | null;
	lastSeenAt: Date | null;
	lastFixAt: Date | null;
	lastLat: number | null;
	lastLng: number | null;
	lastSpeedKph: number | null;
	batteryV: number | null;
	rssiDbm: number | null;
	satellites: number | null;
	ignition: boolean | null;
	configRev: number | null;
	createdAt: Date;
}

const TRACKERS: TrackerSeed[] = [
	{
		key: "navara",
		vehicle: "navara",
		mac: "24:6F:28:C4:1E:7A",
		label: "Navara NDR 4821",
		token: "llk_demo_navara_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.2.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(1 * MINUTE),
		lastFixAt: ago(35 * 1000),
		lastLat: 10.7202,
		lastLng: 122.5621,
		lastSpeedKph: 46,
		batteryV: 12.7,
		rssiDbm: -63,
		satellites: 9,
		ignition: true,
		configRev: 3,
		createdAt: ago(210 * DAY),
	},
	{
		key: "hilux",
		vehicle: "hilux",
		mac: "30:AE:A4:8B:52:D1",
		label: "Hilux FAA 7315",
		token: "llk_demo_hilux_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.2.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(3 * MINUTE),
		lastFixAt: ago(8 * MINUTE),
		lastLat: 10.7305,
		lastLng: 122.5597,
		lastSpeedKph: 0,
		batteryV: 11.8,
		rssiDbm: -96,
		satellites: 4,
		ignition: false,
		// The Hilux echoes the revision of the demo org config, so its detail
		// page shows the confirmed state. The other trackers keep small
		// historical revisions to show the not-yet-confirmed state.
		configRev: DEMO_CONFIG_REV,
		createdAt: ago(380 * DAY),
	},
	{
		key: "dmax",
		vehicle: "dmax",
		mac: "3C:71:BF:09:6A:E3",
		label: "D-Max KAB 9084",
		token: "llk_demo_dmax_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.2.0",
		hwVariant: "esp32-s3-wroom-1",
		lastSeenAt: ago(45 * 1000),
		lastFixAt: ago(20 * 1000),
		lastLat: 10.8247,
		lastLng: 122.7108,
		lastSpeedKph: 0,
		batteryV: 12.4,
		rssiDbm: -74,
		satellites: 8,
		ignition: false,
		configRev: 3,
		createdAt: ago(300 * DAY),
	},
	{
		key: "l300",
		vehicle: "l300",
		mac: "84:F3:EB:2D:8C:44",
		label: "L300 LTA 3175",
		token: "llk_demo_l300_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.1.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(2 * DAY),
		lastFixAt: ago(2 * DAY),
		lastLat: 10.787,
		lastLng: 122.589,
		lastSpeedKph: 0,
		batteryV: 11.2,
		rssiDbm: -101,
		satellites: 3,
		ignition: false,
		configRev: 1,
		createdAt: ago(800 * DAY),
	},
	{
		key: "innova",
		vehicle: "innova",
		mac: "7C:9E:BD:5F:31:A8",
		label: "Innova NGA 6402",
		token: "llk_demo_innova_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.2.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(90 * 1000),
		lastFixAt: ago(60 * 1000),
		lastLat: 10.6997,
		lastLng: 122.5459,
		lastSpeedKph: 22,
		batteryV: 12.6,
		rssiDbm: -69,
		satellites: 7,
		ignition: true,
		configRev: 2,
		createdAt: ago(200 * DAY),
	},
	{
		key: "ranger",
		vehicle: "ranger",
		mac: "A4:CF:12:6E:09:52",
		label: "Ranger CAK 5528",
		token: "llk_demo_ranger_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.1.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(8 * HOUR),
		lastFixAt: ago(8 * HOUR),
		lastLat: 10.693,
		lastLng: 122.474,
		lastSpeedKph: 0,
		batteryV: 12.3,
		rssiDbm: -92,
		satellites: 5,
		ignition: false,
		configRev: 1,
		createdAt: ago(320 * DAY),
	},
	{
		key: "ertiga",
		vehicle: "ertiga",
		mac: "24:6F:28:D7:AB:03",
		label: "Ertiga MAB 2147",
		token: "llk_demo_ertiga_token",
		approvalStatus: "PENDING",
		firmwareVersion: null,
		hwVariant: null,
		lastSeenAt: null,
		lastFixAt: null,
		lastLat: null,
		lastLng: null,
		lastSpeedKph: null,
		batteryV: null,
		rssiDbm: null,
		satellites: null,
		ignition: null,
		configRev: null,
		createdAt: ago(12 * DAY),
	},
	{
		key: "vios",
		vehicle: "vios",
		mac: "30:AE:A4:1C:7F:96",
		label: "Vios PBA 4719",
		token: "llk_demo_vios_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.1.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(4 * MINUTE),
		lastFixAt: ago(9 * MINUTE),
		lastLat: 10.735,
		lastLng: 122.57,
		lastSpeedKph: 0,
		batteryV: 12.5,
		rssiDbm: -89,
		satellites: 6,
		ignition: false,
		configRev: 2,
		createdAt: ago(410 * DAY),
	},
	{
		key: "fortuner",
		vehicle: "fortuner",
		mac: "3C:71:BF:B2:44:0D",
		label: "Fortuner NAA 8163",
		token: "llk_demo_fortuner_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.1.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(3 * HOUR),
		lastFixAt: ago(3 * HOUR),
		lastLat: 10.8,
		lastLng: 122.6,
		lastSpeedKph: 0,
		batteryV: 11.4,
		rssiDbm: -88,
		satellites: 5,
		ignition: false,
		configRev: 1,
		createdAt: ago(500 * DAY),
	},
	{
		key: "montero",
		vehicle: "montero",
		mac: "84:F3:EB:E5:9A:71",
		label: "Montero CAA 2906",
		token: "llk_demo_montero_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.2.0",
		hwVariant: "esp32-s3-wroom-1",
		lastSeenAt: ago(30 * 1000),
		lastFixAt: ago(15 * 1000),
		lastLat: 10.7755,
		lastLng: 122.5408,
		lastSpeedKph: 0,
		batteryV: 12.8,
		rssiDbm: -66,
		satellites: 10,
		ignition: false,
		configRev: 3,
		createdAt: ago(150 * DAY),
	},
	{
		key: "spare",
		vehicle: null,
		mac: "7C:9E:BD:A3:D0:28",
		label: "Bodega spare B-04",
		token: "llk_demo_spare_token",
		approvalStatus: "APPROVED",
		firmwareVersion: "0.1.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(11 * DAY),
		lastFixAt: ago(11 * DAY),
		lastLat: 10.725,
		lastLng: 122.565,
		lastSpeedKph: 0,
		batteryV: 12.2,
		rssiDbm: -80,
		satellites: 4,
		ignition: false,
		configRev: 0,
		createdAt: ago(90 * DAY),
	},
	{
		key: "bench",
		vehicle: null,
		mac: "A4:CF:12:4B:6C:F9",
		label: "Bench unit 07",
		token: "llk_demo_bench_token",
		approvalStatus: "PENDING",
		firmwareVersion: null,
		hwVariant: null,
		lastSeenAt: null,
		lastFixAt: null,
		lastLat: null,
		lastLng: null,
		lastSpeedKph: null,
		batteryV: null,
		rssiDbm: null,
		satellites: null,
		ignition: null,
		configRev: null,
		createdAt: ago(2 * DAY),
	},
	{
		key: "returned",
		vehicle: null,
		mac: "24:6F:28:90:E2:57",
		label: "Returned unit R-12",
		token: "llk_demo_returned_token",
		approvalStatus: "REJECTED",
		firmwareVersion: "0.1.0",
		hwVariant: "esp32-wroom-32",
		lastSeenAt: ago(6 * DAY),
		lastFixAt: ago(6 * DAY),
		lastLat: 10.725,
		lastLng: 122.565,
		lastSpeedKph: 0,
		batteryV: 12,
		rssiDbm: -84,
		satellites: 6,
		ignition: false,
		configRev: 1,
		createdAt: ago(45 * DAY),
	},
];

interface TripSeed {
	key: string;
	vehicle: VehicleKey;
	startedAgoMs: number;
	durationMin: number | null;
	distanceM: number | null;
	maxSpeedKph: number | null;
	status: "ACTIVE" | "COMPLETED" | "ABORTED";
}

const TRIPS: TripSeed[] = [
	{
		key: "navara-active",
		vehicle: "navara",
		startedAgoMs: 2 * HOUR,
		durationMin: null,
		distanceM: 26_800,
		maxSpeedKph: 82,
		status: "ACTIVE",
	},
	{
		key: "navara-1",
		vehicle: "navara",
		startedAgoMs: 26 * HOUR,
		durationMin: 54,
		distanceM: 38_400,
		maxSpeedKph: 78,
		status: "COMPLETED",
	},
	{
		key: "navara-2",
		vehicle: "navara",
		startedAgoMs: 76 * HOUR,
		durationMin: 47,
		distanceM: 31_200,
		maxSpeedKph: 74,
		status: "COMPLETED",
	},
	{
		key: "navara-3",
		vehicle: "navara",
		startedAgoMs: 168 * HOUR,
		durationMin: 63,
		distanceM: 44_600,
		maxSpeedKph: 81,
		status: "COMPLETED",
	},
	{
		key: "navara-4",
		vehicle: "navara",
		startedAgoMs: 288 * HOUR,
		durationMin: 39,
		distanceM: 22_900,
		maxSpeedKph: 69,
		status: "COMPLETED",
	},
	{
		key: "hilux-1",
		vehicle: "hilux",
		startedAgoMs: 640 * MINUTE,
		durationMin: 50,
		distanceM: 27_500,
		maxSpeedKph: 72,
		status: "COMPLETED",
	},
	{
		key: "hilux-2",
		vehicle: "hilux",
		startedAgoMs: 29 * HOUR,
		durationMin: 36,
		distanceM: 16_800,
		maxSpeedKph: 64,
		status: "COMPLETED",
	},
	{
		key: "hilux-3",
		vehicle: "hilux",
		startedAgoMs: 120 * HOUR,
		durationMin: 51,
		distanceM: 29_300,
		maxSpeedKph: 70,
		status: "COMPLETED",
	},
	{
		key: "hilux-4",
		vehicle: "hilux",
		startedAgoMs: 336 * HOUR,
		durationMin: 42,
		distanceM: 19_700,
		maxSpeedKph: 67,
		status: "COMPLETED",
	},
	{
		key: "dmax-1",
		vehicle: "dmax",
		startedAgoMs: 220 * MINUTE,
		durationMin: 50,
		distanceM: 24_600,
		maxSpeedKph: 76,
		status: "COMPLETED",
	},
	{
		key: "dmax-2",
		vehicle: "dmax",
		startedAgoMs: 48 * HOUR,
		durationMin: 58,
		distanceM: 33_100,
		maxSpeedKph: 79,
		status: "COMPLETED",
	},
	{
		key: "dmax-3",
		vehicle: "dmax",
		startedAgoMs: 192 * HOUR,
		durationMin: 44,
		distanceM: 21_400,
		maxSpeedKph: 71,
		status: "COMPLETED",
	},
	{
		key: "innova-1",
		vehicle: "innova",
		startedAgoMs: 6 * HOUR,
		durationMin: 40,
		distanceM: 14_200,
		maxSpeedKph: 58,
		status: "COMPLETED",
	},
	{
		key: "innova-2",
		vehicle: "innova",
		startedAgoMs: 48 * HOUR,
		durationMin: 35,
		distanceM: 12_800,
		maxSpeedKph: 55,
		status: "COMPLETED",
	},
	{
		key: "innova-3",
		vehicle: "innova",
		startedAgoMs: 216 * HOUR,
		durationMin: 47,
		distanceM: 18_600,
		maxSpeedKph: 61,
		status: "COMPLETED",
	},
	{
		key: "ranger-1",
		vehicle: "ranger",
		startedAgoMs: 97 * HOUR,
		durationMin: 70,
		distanceM: 46_200,
		maxSpeedKph: 88,
		status: "COMPLETED",
	},
	{
		key: "ranger-2",
		vehicle: "ranger",
		startedAgoMs: 240 * HOUR,
		durationMin: 55,
		distanceM: 34_900,
		maxSpeedKph: 83,
		status: "COMPLETED",
	},
	{
		key: "vios-1",
		vehicle: "vios",
		startedAgoMs: 50 * HOUR,
		durationMin: 32,
		distanceM: 11_500,
		maxSpeedKph: 54,
		status: "COMPLETED",
	},
	{
		key: "vios-2",
		vehicle: "vios",
		startedAgoMs: 192 * HOUR,
		durationMin: 28,
		distanceM: 9_400,
		maxSpeedKph: 49,
		status: "ABORTED",
	},
	{
		key: "fortuner-1",
		vehicle: "fortuner",
		startedAgoMs: 144 * HOUR,
		durationMin: 38,
		distanceM: 13_900,
		maxSpeedKph: 57,
		status: "COMPLETED",
	},
	{
		key: "fortuner-2",
		vehicle: "fortuner",
		startedAgoMs: 384 * HOUR,
		durationMin: 45,
		distanceM: 17_300,
		maxSpeedKph: 62,
		status: "COMPLETED",
	},
	{
		key: "montero-1",
		vehicle: "montero",
		startedAgoMs: 510 * MINUTE,
		durationMin: 60,
		distanceM: 39_800,
		maxSpeedKph: 84,
		status: "COMPLETED",
	},
	{
		key: "montero-2",
		vehicle: "montero",
		startedAgoMs: 408 * HOUR,
		durationMin: 52,
		distanceM: 28_400,
		maxSpeedKph: 73,
		status: "COMPLETED",
	},
	{
		key: "montero-3",
		vehicle: "montero",
		startedAgoMs: 600 * HOUR,
		durationMin: 41,
		distanceM: 17_900,
		maxSpeedKph: 68,
		status: "COMPLETED",
	},
	{
		key: "l300-1",
		vehicle: "l300",
		startedAgoMs: 144 * HOUR,
		durationMin: 66,
		distanceM: 31_700,
		maxSpeedKph: 65,
		status: "COMPLETED",
	},
	{
		key: "l300-2",
		vehicle: "l300",
		startedAgoMs: 480 * HOUR,
		durationMin: 49,
		distanceM: 24_300,
		maxSpeedKph: 62,
		status: "COMPLETED",
	},
];

const ALERT_PHONE_DISPATCH = "+639333120145";
const ALERT_PHONE_SAFETY = "+639177840221";
const ALERT_PHONE_CLINIC = "+639189902714";
const ALERT_EMAIL_DISPATCH = "dispatch@lifelink.local";
const ALERT_EMAIL_SAFETY = "safety@lifelink.local";
const ALERT_WEBHOOK = "https://dispatch.lifelink.local/hooks/crash";

interface AlertSeed {
	channel: "SMS" | "EMAIL" | "HTTP";
	target: string;
	status: "QUEUED" | "SENT" | "FAILED" | "ACKNOWLEDGED";
	attempts: number;
	error?: string;
}

interface IncidentSeed {
	key: string;
	vehicle: VehicleKey;
	device: string;
	detectedAgoMs: number;
	status: "SUSPECTED" | "CONFIRMED" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED" | "FALSE_ALARM";
	peakAccelG: number;
	tiltDeg: number;
	vibrationCount: number;
	speedKph: number;
	lat: number;
	lng: number;
	gpsAgeS: number;
	trip: string | null;
	cancelledAfterS?: number;
	resolvedAgoMs?: number;
	resolution?: string;
	alerts: AlertSeed[];
}

const INCIDENTS: IncidentSeed[] = [
	{
		key: "navara-mandurriao",
		vehicle: "navara",
		device: "navara",
		detectedAgoMs: 32 * MINUTE,
		status: "SUSPECTED",
		peakAccelG: 2.9,
		tiltDeg: 54,
		vibrationCount: 9,
		speedKph: 44,
		lat: 10.7177,
		lng: 122.5552,
		gpsAgeS: 2,
		trip: "navara-active",
		alerts: [],
	},
	{
		key: "dmax-dumangas",
		vehicle: "dmax",
		device: "dmax",
		detectedAgoMs: 180 * MINUTE,
		status: "CONFIRMED",
		peakAccelG: 4.4,
		tiltDeg: 71,
		vibrationCount: 18,
		speedKph: 72,
		lat: 10.8247,
		lng: 122.7108,
		gpsAgeS: 3,
		trip: "dmax-1",
		alerts: [
			{ channel: "SMS", target: ALERT_PHONE_DISPATCH, status: "SENT", attempts: 1 },
			{
				channel: "SMS",
				target: ALERT_PHONE_SAFETY,
				status: "FAILED",
				attempts: 3,
				error: "No route to handset",
			},
			{ channel: "EMAIL", target: ALERT_EMAIL_DISPATCH, status: "QUEUED", attempts: 0 },
		],
	},
	{
		key: "montero-pavia",
		vehicle: "montero",
		device: "montero",
		detectedAgoMs: 480 * MINUTE,
		status: "ACKNOWLEDGED",
		peakAccelG: 3.3,
		tiltDeg: 63,
		vibrationCount: 12,
		speedKph: 58,
		lat: 10.7755,
		lng: 122.5408,
		gpsAgeS: 4,
		trip: "montero-1",
		alerts: [
			{
				channel: "SMS",
				target: ALERT_PHONE_DISPATCH,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
			{ channel: "EMAIL", target: ALERT_EMAIL_DISPATCH, status: "SENT", attempts: 1 },
		],
	},
	{
		key: "hilux-jaro",
		vehicle: "hilux",
		device: "hilux",
		detectedAgoMs: 600 * MINUTE,
		status: "RESOLVED",
		peakAccelG: 2.6,
		tiltDeg: 47,
		vibrationCount: 7,
		speedKph: 36,
		lat: 10.7305,
		lng: 122.5597,
		gpsAgeS: 2,
		trip: "hilux-1",
		resolvedAgoMs: 35 * MINUTE,
		resolution:
			"Driver checked in by phone. No injuries; front bumper and left lamp replaced at the Jaro shop.",
		alerts: [
			{
				channel: "SMS",
				target: ALERT_PHONE_DISPATCH,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
			{ channel: "EMAIL", target: ALERT_EMAIL_SAFETY, status: "SENT", attempts: 1 },
		],
	},
	{
		key: "innova-molo",
		vehicle: "innova",
		device: "innova",
		detectedAgoMs: 1440 * MINUTE,
		status: "FALSE_ALARM",
		peakAccelG: 2.2,
		tiltDeg: 18,
		vibrationCount: 4,
		speedKph: 12,
		lat: 10.6997,
		lng: 122.5459,
		gpsAgeS: 6,
		trip: null,
		resolvedAgoMs: 1380 * MINUTE,
		resolution: "Pothole strike at Molo plaza. Driver confirmed no damage and no injuries.",
		alerts: [
			{ channel: "SMS", target: ALERT_PHONE_DISPATCH, status: "SENT", attempts: 1 },
			{ channel: "EMAIL", target: ALERT_EMAIL_DISPATCH, status: "SENT", attempts: 1 },
		],
	},
	{
		key: "vios-lapaz",
		vehicle: "vios",
		device: "vios",
		detectedAgoMs: 2880 * MINUTE,
		status: "CANCELLED",
		peakAccelG: 2.7,
		tiltDeg: 41,
		vibrationCount: 5,
		speedKph: 28,
		lat: 10.735,
		lng: 122.57,
		gpsAgeS: 3,
		trip: null,
		cancelledAfterS: 9,
		alerts: [],
	},
	{
		key: "ranger-oton",
		vehicle: "ranger",
		device: "ranger",
		detectedAgoMs: 5760 * MINUTE,
		status: "RESOLVED",
		peakAccelG: 4.9,
		tiltDeg: 82,
		vibrationCount: 21,
		speedKph: 64,
		lat: 10.693,
		lng: 122.474,
		gpsAgeS: 5,
		trip: "ranger-1",
		resolvedAgoMs: 5600 * MINUTE,
		resolution:
			"Rollover while avoiding a dog. Driver treated at the district hospital and discharged; insurer notified.",
		alerts: [
			{
				channel: "SMS",
				target: ALERT_PHONE_DISPATCH,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
			{ channel: "HTTP", target: ALERT_WEBHOOK, status: "SENT", attempts: 1 },
			{
				channel: "EMAIL",
				target: ALERT_EMAIL_SAFETY,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
		],
	},
	{
		key: "fortuner-leganes",
		vehicle: "fortuner",
		device: "fortuner",
		detectedAgoMs: 8640 * MINUTE,
		status: "FALSE_ALARM",
		peakAccelG: 2.3,
		tiltDeg: 31,
		vibrationCount: 3,
		speedKph: 0,
		lat: 10.787,
		lng: 122.589,
		gpsAgeS: 8,
		trip: null,
		resolvedAgoMs: 8400 * MINUTE,
		resolution: "Parked unit nudged by a motorcycle at the Leganes terminal. No damage.",
		alerts: [{ channel: "EMAIL", target: ALERT_EMAIL_DISPATCH, status: "SENT", attempts: 1 }],
	},
	{
		key: "navara-passi",
		vehicle: "navara",
		device: "navara",
		detectedAgoMs: 12960 * MINUTE,
		status: "ACKNOWLEDGED",
		peakAccelG: 3.6,
		tiltDeg: 68,
		vibrationCount: 15,
		speedKph: 70,
		lat: 11.1075,
		lng: 122.6419,
		gpsAgeS: 4,
		trip: null,
		alerts: [
			{
				channel: "SMS",
				target: ALERT_PHONE_DISPATCH,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
			{ channel: "EMAIL", target: ALERT_EMAIL_SAFETY, status: "SENT", attempts: 1 },
		],
	},
	{
		key: "l300-zarraga",
		vehicle: "l300",
		device: "l300",
		detectedAgoMs: 18720 * MINUTE,
		status: "CONFIRMED",
		peakAccelG: 3.1,
		tiltDeg: 61,
		vibrationCount: 11,
		speedKph: 47,
		lat: 10.821,
		lng: 122.607,
		gpsAgeS: 9,
		trip: null,
		alerts: [
			{
				channel: "SMS",
				target: ALERT_PHONE_DISPATCH,
				status: "FAILED",
				attempts: 3,
				error: "Modem did not register",
			},
			{ channel: "EMAIL", target: ALERT_EMAIL_DISPATCH, status: "SENT", attempts: 1 },
		],
	},
	{
		key: "montero-iloilo",
		vehicle: "montero",
		device: "montero",
		detectedAgoMs: 24480 * MINUTE,
		status: "RESOLVED",
		peakAccelG: 2.8,
		tiltDeg: 50,
		vibrationCount: 8,
		speedKph: 33,
		lat: 10.7202,
		lng: 122.5621,
		gpsAgeS: 3,
		trip: null,
		resolvedAgoMs: 24300 * MINUTE,
		resolution: "Rear-end collision at a stoplight. Driver unhurt; bumper repaired.",
		alerts: [
			{
				channel: "SMS",
				target: ALERT_PHONE_DISPATCH,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
		],
	},
	{
		key: "innova-guimaras",
		vehicle: "innova",
		device: "innova",
		detectedAgoMs: 33120 * MINUTE,
		status: "CANCELLED",
		peakAccelG: 2.6,
		tiltDeg: 44,
		vibrationCount: 6,
		speedKph: 31,
		lat: 10.658,
		lng: 122.588,
		gpsAgeS: 7,
		trip: null,
		cancelledAfterS: 12,
		alerts: [],
	},
	{
		key: "dmax-santabarbara",
		vehicle: "dmax",
		device: "dmax",
		detectedAgoMs: 41760 * MINUTE,
		status: "RESOLVED",
		peakAccelG: 4.2,
		tiltDeg: 77,
		vibrationCount: 19,
		speedKph: 66,
		lat: 10.828,
		lng: 122.535,
		gpsAgeS: 5,
		trip: null,
		resolvedAgoMs: 41400 * MINUTE,
		resolution:
			"Head-on collision with a tricycle near Santa Barbara. Driver unhurt; vehicle repaired and returned to service.",
		alerts: [
			{
				channel: "SMS",
				target: ALERT_PHONE_DISPATCH,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
			{
				channel: "EMAIL",
				target: ALERT_EMAIL_SAFETY,
				status: "ACKNOWLEDGED",
				attempts: 1,
			},
		],
	},
];

interface TelemetryBatchSeed {
	prefix: string;
	device: string;
	trip: string;
	startedAgoMs: number;
	count: number;
	intervalMs: number;
	from: [number, number];
	to: [number, number];
	speedKph: number;
	batteryV: number;
	satellites: number;
}

const TELEMETRY_BATCHES: TelemetryBatchSeed[] = [
	{
		prefix: "navara-active",
		device: "navara",
		trip: "navara-active",
		startedAgoMs: 510 * 1000,
		count: 18,
		intervalMs: 30 * 1000,
		from: [10.705, 122.55],
		to: [10.7202, 122.5621],
		speedKph: 42,
		batteryV: 12.7,
		satellites: 9,
	},
	{
		prefix: "hilux-1",
		device: "hilux",
		trip: "hilux-1",
		startedAgoMs: 640 * MINUTE,
		count: 12,
		intervalMs: MINUTE,
		from: [10.745, 122.575],
		to: [10.7305, 122.5597],
		speedKph: 45,
		batteryV: 11.8,
		satellites: 4,
	},
	{
		prefix: "montero-1",
		device: "montero",
		trip: "montero-1",
		startedAgoMs: 510 * MINUTE,
		count: 10,
		intervalMs: MINUTE,
		from: [10.735, 122.57],
		to: [10.7755, 122.5408],
		speedKph: 50,
		batteryV: 12.8,
		satellites: 10,
	},
	{
		prefix: "innova-1",
		device: "innova",
		trip: "innova-1",
		startedAgoMs: 6 * HOUR,
		count: 10,
		intervalMs: MINUTE,
		from: [10.72, 122.562],
		to: [10.6997, 122.5459],
		speedKph: 30,
		batteryV: 12.6,
		satellites: 7,
	},
];

interface DeviceEventSeed {
	device: string;
	type:
		| "HEARTBEAT"
		| "POWER_LOST"
		| "POWER_RESTORED"
		| "GPS_FIX_LOST"
		| "MODEM_FAULT"
		| "SENSOR_FAULT"
		| "CONFIG_APPLIED"
		| "OTA_INSTALLED"
		| "OTA_ROLLED_BACK"
		| "SAFE_MODE_ENTERED"
		| "DEVICE_OFFLINE";
	at: Date;
	metadata: Record<string, string | number | boolean>;
}

const DEVICE_EVENTS: DeviceEventSeed[] = [
	{ device: "navara", type: "CONFIG_APPLIED", at: ago(2 * DAY), metadata: { rev: 3 } },
	{ device: "navara", type: "POWER_LOST", at: ago(21 * DAY + 2 * HOUR), metadata: { rail: "12V" } },
	{
		device: "navara",
		type: "POWER_RESTORED",
		at: ago(21 * DAY + 1 * HOUR),
		metadata: { rail: "12V" },
	},
	{ device: "hilux", type: "POWER_LOST", at: ago(5 * DAY + 3 * HOUR), metadata: { rail: "12V" } },
	{
		device: "hilux",
		type: "POWER_RESTORED",
		at: ago(5 * DAY + 2 * HOUR),
		metadata: { rail: "12V" },
	},
	{ device: "hilux", type: "OTA_INSTALLED", at: ago(18 * DAY), metadata: { version: "0.2.0" } },
	{ device: "dmax", type: "MODEM_FAULT", at: ago(4 * HOUR), metadata: { retries: 3 } },
	{ device: "l300", type: "SENSOR_FAULT", at: ago(2 * DAY), metadata: { sensor: "imu" } },
	{
		device: "l300",
		type: "DEVICE_OFFLINE",
		at: ago(3 * DAY),
		metadata: { reason: "no heartbeat" },
	},
	{ device: "innova", type: "OTA_INSTALLED", at: ago(3 * DAY), metadata: { version: "0.2.0" } },
	{ device: "innova", type: "CONFIG_APPLIED", at: ago(3 * DAY), metadata: { rev: 2 } },
	{ device: "ranger", type: "GPS_FIX_LOST", at: ago(9 * HOUR), metadata: { satellites: 2 } },
	{
		device: "ranger",
		type: "DEVICE_OFFLINE",
		at: ago(8 * HOUR),
		metadata: { reason: "no heartbeat" },
	},
	{ device: "vios", type: "POWER_LOST", at: ago(6 * DAY), metadata: { rail: "12V" } },
	{
		device: "vios",
		type: "POWER_RESTORED",
		at: ago(5 * DAY + 20 * HOUR),
		metadata: { rail: "12V" },
	},
	{
		device: "fortuner",
		type: "DEVICE_OFFLINE",
		at: ago(3 * HOUR),
		metadata: { reason: "no heartbeat" },
	},
	{
		device: "montero",
		type: "HEARTBEAT",
		at: ago(30 * 1000),
		metadata: { rssi: -66, battery: 12.8 },
	},
	{ device: "montero", type: "OTA_INSTALLED", at: ago(5 * DAY), metadata: { version: "0.2.0" } },
	{ device: "spare", type: "CONFIG_APPLIED", at: ago(11 * DAY), metadata: { rev: 0 } },
	{ device: "returned", type: "SAFE_MODE_ENTERED", at: ago(8 * DAY), metadata: { resets: 3 } },
	{ device: "returned", type: "OTA_ROLLED_BACK", at: ago(7 * DAY), metadata: { from: "0.2.0" } },
];

interface CommandSeed {
	key: string;
	device: string;
	kind: "LOCATE" | "ARM" | "DISARM" | "TEST_ALERT" | "SET_CONFIG" | "ROTATE_TOKEN";
	status: "PENDING" | "ACKED" | "EXPIRED" | "FAILED";
	createdAt: Date;
	expiresAt: Date;
	ackedAt: Date | null;
	payload: Record<string, string | number>;
}

const COMMANDS: CommandSeed[] = [
	{
		key: "navara-locate",
		device: "navara",
		kind: "LOCATE",
		status: "PENDING",
		createdAt: ago(2 * MINUTE),
		expiresAt: new Date(now.getTime() + 8 * MINUTE),
		ackedAt: null,
		payload: { reason: "dispatch requested a position check" },
	},
	{
		key: "navara-arm",
		device: "navara",
		kind: "ARM",
		status: "ACKED",
		createdAt: ago(2 * DAY),
		expiresAt: ago(2 * DAY - 10 * MINUTE),
		ackedAt: ago(2 * DAY - 40 * 1000),
		payload: {},
	},
	{
		key: "navara-test",
		device: "navara",
		kind: "TEST_ALERT",
		status: "ACKED",
		createdAt: ago(5 * DAY),
		expiresAt: ago(5 * DAY - 10 * MINUTE),
		ackedAt: ago(5 * DAY - 12 * 1000),
		payload: { target: "bench" },
	},
	{
		key: "hilux-locate",
		device: "hilux",
		kind: "LOCATE",
		status: "ACKED",
		createdAt: ago(1 * HOUR),
		expiresAt: ago(1 * HOUR - 10 * MINUTE),
		ackedAt: ago(1 * HOUR - 25 * 1000),
		payload: {},
	},
	{
		key: "hilux-config",
		device: "hilux",
		kind: "SET_CONFIG",
		status: "ACKED",
		createdAt: ago(3 * DAY),
		expiresAt: ago(3 * DAY - 10 * MINUTE),
		ackedAt: ago(3 * DAY - 1 * MINUTE),
		// The same object the app builds, so the seeded ACK and the echoed
		// configRev describe a real applied configuration.
		payload: buildFirmwareConfig(DEMO_ORG_CONFIG),
	},
	{
		key: "dmax-locate",
		device: "dmax",
		kind: "LOCATE",
		status: "EXPIRED",
		createdAt: ago(1 * DAY),
		expiresAt: ago(1 * DAY - 10 * MINUTE),
		ackedAt: null,
		payload: {},
	},
	{
		key: "l300-arm",
		device: "l300",
		kind: "ARM",
		status: "FAILED",
		createdAt: ago(2 * DAY),
		expiresAt: ago(2 * DAY - 10 * MINUTE),
		ackedAt: null,
		payload: {},
	},
	{
		key: "montero-locate",
		device: "montero",
		kind: "LOCATE",
		status: "ACKED",
		createdAt: ago(12 * MINUTE),
		expiresAt: ago(2 * MINUTE),
		ackedAt: ago(11 * MINUTE + 40 * 1000),
		payload: {},
	},
	{
		key: "bench-rotate",
		device: "bench",
		kind: "ROTATE_TOKEN",
		status: "PENDING",
		createdAt: ago(5 * MINUTE),
		expiresAt: new Date(now.getTime() + 5 * MINUTE),
		ackedAt: null,
		payload: {},
	},
];

interface TelemetryPoint {
	id: string;
	deviceId: string;
	tripId: string | null;
	clientSampleId: string;
	recordedAt: Date;
	createdAt: Date;
	lat: number;
	lng: number;
	speedKph: number;
	headingDeg: number;
	accelG: number;
	tiltDeg: number;
	vibration: boolean;
	satellites: number;
	hdop: number;
	batteryV: number;
	ignition: boolean;
}

function telemetryPoints(batch: TelemetryBatchSeed, deviceId: string, tripId: string) {
	const startedAt = ago(batch.startedAgoMs);
	const [fromLat, fromLng] = batch.from;
	const [toLat, toLng] = batch.to;

	return Array.from({ length: batch.count }, (_, index): TelemetryPoint => {
		const ratio = batch.count === 1 ? 1 : index / (batch.count - 1);
		const recordedAt = new Date(startedAt.getTime() + index * batch.intervalMs);
		return {
			id: `demo-sample-${batch.prefix}-${index}`,
			deviceId,
			tripId,
			clientSampleId: `demo-${batch.prefix}-${index}`,
			recordedAt,
			createdAt: recordedAt,
			lat: Number((fromLat + (toLat - fromLat) * ratio).toFixed(6)),
			lng: Number((fromLng + (toLng - fromLng) * ratio).toFixed(6)),
			speedKph: Number((batch.speedKph * (0.85 + ((index * 3) % 5) * 0.04)).toFixed(1)),
			headingDeg: (index * 23) % 360,
			accelG: Number((0.12 + ((index * 7) % 5) * 0.03).toFixed(2)),
			tiltDeg: Number((1.1 + ((index * 5) % 4) * 0.5).toFixed(1)),
			vibration: index % 7 === 3,
			satellites: batch.satellites,
			hdop: Number((0.9 + ((index * 3) % 4) * 0.1).toFixed(1)),
			batteryV: batch.batteryV,
			ignition: true,
		};
	});
}

function evidenceFor(incident: IncidentSeed) {
	const detectedAt = ago(incident.detectedAgoMs);
	return {
		samples: Array.from({ length: 18 }, (_, index) => {
			const at = new Date(detectedAt.getTime() + (index - 9) * 1000);
			const nearSpike = index === 8 || index === 10;
			const accel =
				index === 9
					? incident.peakAccelG
					: nearSpike
						? incident.peakAccelG * 0.78
						: 0.08 + ((index * 13) % 7) * 0.03;
			const tilt =
				index === 9
					? incident.tiltDeg
					: nearSpike
						? incident.tiltDeg * 0.82
						: 0.9 + ((index * 5) % 5) * 0.6;

			return {
				t: Math.floor(at.getTime() / 1000),
				accel_g: Number(accel.toFixed(2)),
				tilt_deg: Number(tilt.toFixed(1)),
			};
		}),
	};
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
			// The demo seed restores a revoked demo account so the documented
			// sign-in still works after someone tries the revoke flow.
			update: { role: membership.role, revokedAt: null, invitedBy: null },
		});
	}

	await prisma.orgSettings.upsert({
		where: { orgId: org.id },
		create: {
			orgId: org.id,
			...DEMO_ORG_CONFIG,
			telemetryRetentionDays: 30,
			incidentRetentionDays: 365,
			alertPhones: [ALERT_PHONE_DISPATCH, ALERT_PHONE_SAFETY],
			alertEmails: [ALERT_EMAIL_DISPATCH, ALERT_EMAIL_SAFETY],
			parkedImpactAlerts: false,
		},
		update: {
			...DEMO_ORG_CONFIG,
			alertPhones: [ALERT_PHONE_DISPATCH, ALERT_PHONE_SAFETY],
			alertEmails: [ALERT_EMAIL_DISPATCH, ALERT_EMAIL_SAFETY],
		},
	});

	// The demo organization belongs to this seed. Clearing the fleet makes
	// re-runs deterministic and removes rows left by an older demo dataset.
	await prisma.trackerDevice.deleteMany({ where: { orgId: org.id } });
	await prisma.vehicle.deleteMany({ where: { orgId: org.id } });
	await prisma.emergencyContact.deleteMany({ where: { orgId: org.id } });
	await prisma.auditLog.deleteMany({ where: { orgId: org.id, action: "demo.seeded" } });

	const vehicleId = (key: VehicleKey) => `demo-vehicle-${key}`;
	const deviceId = (key: string) => `demo-device-${key}`;

	await prisma.vehicle.createMany({
		data: VEHICLES.map((vehicle) => ({
			id: vehicleId(vehicle.key),
			orgId: org.id,
			ownerId: vehicle.owner ? owner.id : null,
			plateNo: vehicle.plateNo,
			make: vehicle.make,
			model: vehicle.model,
			year: vehicle.year,
			driverName: vehicle.driverName,
			driverPhone: vehicle.driverPhone,
			status: vehicle.status,
			createdAt: ago(400 * DAY),
			updatedAt: ago(3 * DAY),
		})),
	});

	await prisma.trackerDevice.createMany({
		data: TRACKERS.map((tracker) => ({
			id: deviceId(tracker.key),
			orgId: org.id,
			vehicleId: tracker.vehicle ? vehicleId(tracker.vehicle) : null,
			mac: tracker.mac,
			label: tracker.label,
			tokenHash: hashToken(tracker.token),
			approvalStatus: tracker.approvalStatus,
			firmwareVersion: tracker.firmwareVersion,
			hwVariant: tracker.hwVariant,
			lastSeenAt: tracker.lastSeenAt,
			lastLat: tracker.lastLat,
			lastLng: tracker.lastLng,
			lastFixAt: tracker.lastFixAt,
			lastSpeedKph: tracker.lastSpeedKph,
			batteryV: tracker.batteryV,
			rssiDbm: tracker.rssiDbm,
			satellites: tracker.satellites,
			ignition: tracker.ignition,
			configRev: tracker.configRev,
			createdAt: tracker.createdAt,
			updatedAt: tracker.lastSeenAt ?? tracker.createdAt,
		})),
	});

	await prisma.trip.createMany({
		data: TRIPS.map((trip) => {
			const tracker = TRACKERS.find((entry) => entry.vehicle === trip.vehicle);
			if (!tracker) {
				throw new Error(`No tracker seeded for vehicle ${trip.vehicle}`);
			}
			const startedAt = ago(trip.startedAgoMs);

			return {
				id: `demo-trip-${trip.key}`,
				orgId: org.id,
				vehicleId: vehicleId(trip.vehicle),
				deviceId: deviceId(tracker.key),
				startedAt,
				endedAt:
					trip.durationMin == null
						? null
						: new Date(startedAt.getTime() + trip.durationMin * MINUTE),
				distanceM: trip.distanceM,
				maxSpeedKph: trip.maxSpeedKph,
				status: trip.status,
				createdAt: startedAt,
			};
		}),
	});

	const tripByKey = new Map(TRIPS.map((trip) => [trip.key, trip]));
	const incidentId = (key: string) => `demo-impact-${key}`;
	const incidentRows = INCIDENTS.map((incident) => {
		const detectedAt = ago(incident.detectedAgoMs);
		const trip = incident.trip ? tripByKey.get(incident.trip) : undefined;
		if (incident.trip && !trip) {
			throw new Error(`Unknown trip ${incident.trip} on incident ${incident.key}`);
		}

		return {
			id: incidentId(incident.key),
			orgId: org.id,
			deviceId: deviceId(incident.device),
			vehicleId: vehicleId(incident.vehicle),
			tripId: trip ? `demo-trip-${trip.key}` : null,
			clientIncidentId: `demo-${incident.key}`,
			detectedAt,
			peakAccelG: incident.peakAccelG,
			tiltDeg: incident.tiltDeg,
			vibrationCount: incident.vibrationCount,
			speedKph: incident.speedKph,
			lat: incident.lat,
			lng: incident.lng,
			gpsAgeS: incident.gpsAgeS,
			status: incident.status,
			cancelDeadline: new Date(detectedAt.getTime() + 15 * 1000),
			cancelledAt:
				incident.cancelledAfterS == null
					? null
					: new Date(detectedAt.getTime() + incident.cancelledAfterS * 1000),
			resolvedAt: incident.resolvedAgoMs == null ? null : ago(incident.resolvedAgoMs),
			resolution: incident.resolution ?? null,
			evidence: evidenceFor(incident),
			createdAt: detectedAt,
			updatedAt:
				incident.resolvedAgoMs != null
					? ago(incident.resolvedAgoMs)
					: incident.cancelledAfterS != null
						? new Date(detectedAt.getTime() + incident.cancelledAfterS * 1000)
						: detectedAt,
		};
	});

	await prisma.impactEvent.createMany({ data: incidentRows });

	const alerts = INCIDENTS.flatMap((incident) =>
		incident.alerts.map((alert, index) => ({
			id: `demo-alert-${incident.key}-${index}`,
			impactEventId: incidentId(incident.key),
			channel: alert.channel,
			target: alert.target,
			status: alert.status,
			attempts: alert.attempts,
			error: alert.error ?? null,
			createdAt: new Date(ago(incident.detectedAgoMs).getTime() + 16 * 1000),
			sentAt:
				alert.status === "SENT" || alert.status === "ACKNOWLEDGED"
					? new Date(ago(incident.detectedAgoMs).getTime() + 16 * 1000)
					: null,
		})),
	);
	await prisma.alertDelivery.createMany({ data: alerts });

	const telemetry = TELEMETRY_BATCHES.flatMap((batch) =>
		telemetryPoints(batch, deviceId(batch.device), `demo-trip-${batch.trip}`),
	);
	await prisma.telemetrySample.createMany({ data: telemetry });

	interface IncidentEventRow {
		id: string;
		deviceId: string;
		clientEventId: string;
		type: "HEARTBEAT" | "INCIDENT_CANCELLED" | "INCIDENT_CONFIRMED";
		metadata: Record<string, string | number | boolean>;
		createdAt: Date;
	}

	const incidentEvents = INCIDENTS.flatMap((incident): IncidentEventRow[] => {
		const detectedAt = ago(incident.detectedAgoMs);
		const rows: IncidentEventRow[] = [
			{
				id: `demo-event-${incident.key}-heartbeat`,
				deviceId: deviceId(incident.device),
				clientEventId: `demo-${incident.key}-heartbeat`,
				type: "HEARTBEAT" as const,
				metadata: { source: "demo-seed", rssi: -72 },
				createdAt: new Date(detectedAt.getTime() - 3 * MINUTE),
			},
		];

		if (incident.status === "CANCELLED" && incident.cancelledAfterS != null) {
			rows.push({
				id: `demo-event-${incident.key}-cancelled`,
				deviceId: deviceId(incident.device),
				clientEventId: `demo-${incident.key}-cancelled`,
				type: "INCIDENT_CANCELLED" as const,
				metadata: { source: "demo-seed" },
				createdAt: new Date(detectedAt.getTime() + incident.cancelledAfterS * 1000),
			});
		} else if (incident.status !== "SUSPECTED") {
			rows.push({
				id: `demo-event-${incident.key}-confirmed`,
				deviceId: deviceId(incident.device),
				clientEventId: `demo-${incident.key}-confirmed`,
				type: "INCIDENT_CONFIRMED" as const,
				metadata: { source: "demo-seed" },
				createdAt: new Date(detectedAt.getTime() + 1000),
			});
		}

		return rows;
	});

	await prisma.deviceStateEvent.createMany({
		data: [
			...incidentEvents,
			...DEVICE_EVENTS.map((event, index) => ({
				id: `demo-device-event-${event.device}-${index}`,
				deviceId: deviceId(event.device),
				clientEventId: `demo-device-${event.device}-${index}`,
				type: event.type,
				metadata: { source: "demo-seed", ...event.metadata },
				createdAt: event.at,
			})),
		],
	});

	await prisma.deviceCommand.createMany({
		data: COMMANDS.map((command) => ({
			id: `demo-command-${command.key}`,
			deviceId: deviceId(command.device),
			kind: command.kind,
			payload: command.payload,
			status: command.status,
			createdAt: command.createdAt,
			expiresAt: command.expiresAt,
			ackedAt: command.ackedAt,
		})),
	});

	await prisma.emergencyContact.createMany({
		data: [
			{
				id: "demo-contact-dispatcher",
				orgId: org.id,
				name: "Danilo Espinosa",
				phone: ALERT_PHONE_DISPATCH,
				email: "danilo.espinosa@lifelink.local",
				active: true,
				createdAt: ago(180 * DAY),
			},
			{
				id: "demo-contact-safety",
				orgId: org.id,
				name: "Mylene Catedral",
				phone: ALERT_PHONE_SAFETY,
				email: "mylene.catedral@lifelink.local",
				active: true,
				createdAt: ago(180 * DAY),
			},
			{
				id: "demo-contact-clinic",
				orgId: org.id,
				name: "Dr. Ernesto Salazar",
				phone: ALERT_PHONE_CLINIC,
				email: "ernesto.salazar@lifelink.local",
				active: true,
				createdAt: ago(120 * DAY),
			},
		],
	});

	await prisma.auditLog.create({
		data: {
			orgId: org.id,
			actorId: admin.id,
			action: "demo.seeded",
			target: org.id,
			metadata: {
				vehicles: VEHICLES.length,
				trackers: TRACKERS.length,
				incidents: INCIDENTS.length,
				trips: TRIPS.length,
			},
		},
	});

	console.log("LifeLink demo seed complete.");
	console.log(
		`Fleet: ${VEHICLES.length} vehicles, ${TRACKERS.length} trackers, ${TRIPS.length} trips, ${INCIDENTS.length} incidents, ${alerts.length} alert deliveries.`,
	);
	console.log("Admin:         admin@lifelink.local / Admin123!");
	console.log("Vehicle owner: owner@lifelink.local / Owner123!");
	console.log("Responder:     responder@lifelink.local / Responder123!");
	console.log("Device tokens:");
	for (const tracker of TRACKERS) {
		console.log(`  ${tracker.label}: ${tracker.token}`);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
