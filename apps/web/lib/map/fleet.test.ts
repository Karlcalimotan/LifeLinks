import { describe, expect, it } from "vitest";
import {
	type FleetDeviceInput,
	type FleetVehicleInput,
	type FleetVehicleView,
	OPEN_INCIDENT_STATUSES,
	buildFleetVehicles,
	filterFleetVehicles,
	markerStateFor,
	matchesFleetQuery,
	vehiclesWithPosition,
} from "./fleet";
import { parseMapQuery } from "./query";

const NOW = new Date("2026-11-22T12:00:00.000Z");

function makeDevice(overrides: Partial<FleetDeviceInput> = {}): FleetDeviceInput {
	return {
		id: "dev-01",
		label: "Navara tracker",
		mac: "C8:2B:96:1D:4E:7A",
		lastSeenAt: new Date("2026-11-22T11:59:30.000Z"),
		lastLat: 10.3157,
		lastLng: 123.8854,
		lastFixAt: new Date("2026-11-22T11:59:30.000Z"),
		lastSpeedKph: 0,
		batteryV: 12.6,
		rssiDbm: -72,
		satellites: 9,
		...overrides,
	};
}

function makeVehicle(overrides: Partial<FleetVehicleInput> = {}): FleetVehicleInput {
	return {
		id: "veh-01",
		plateNo: "FDR 2188",
		make: "Nissan",
		model: "Navara",
		year: 2021,
		driverName: "Ramon Dela Cruz",
		driverPhone: "+63 917 000 0000",
		device: makeDevice(),
		...overrides,
	};
}

function view(overrides: Partial<FleetVehicleView> = {}): FleetVehicleView {
	const built = buildFleetVehicles([makeVehicle()], [], NOW)[0];
	if (!built) throw new Error("fixture did not build");
	return { ...built, ...overrides };
}

describe("markerStateFor", () => {
	it("puts an open incident above every connection state", () => {
		expect(markerStateFor("online", false, true)).toBe("incident");
		expect(markerStateFor("offline", true, true)).toBe("incident");
		expect(markerStateFor("unknown", true, true)).toBe("incident");
	});

	it("puts low battery above weak but below offline", () => {
		expect(markerStateFor("online", true, false)).toBe("low-battery");
		expect(markerStateFor("weak", true, false)).toBe("low-battery");
		expect(markerStateFor("weak", false, false)).toBe("weak");
		expect(markerStateFor("offline", true, false)).toBe("offline");
	});

	it("treats an unknown heartbeat as never seen", () => {
		expect(markerStateFor("unknown", true, false)).toBe("never-seen");
		expect(markerStateFor("unknown", false, false)).toBe("never-seen");
	});
});

describe("buildFleetVehicles", () => {
	it("reads the position and derives the connected state", () => {
		const [vehicle] = buildFleetVehicles([makeVehicle()], [], NOW);

		expect(vehicle?.position).toEqual({ lat: 10.3157, lng: 123.8854 });
		expect(vehicle?.connectionState).toBe("online");
		expect(vehicle?.markerState).toBe("online");
		expect(vehicle?.lowBattery).toBe(false);
		expect(vehicle?.staleFix).toBe(false);
		expect(vehicle?.lastFixAgeSeconds).toBe(30);
	});

	it("keeps a vehicle with no tracker visible as never seen", () => {
		const [vehicle] = buildFleetVehicles([makeVehicle({ device: null })], [], NOW);

		expect(vehicle?.position).toBeNull();
		expect(vehicle?.connectionState).toBe("unknown");
		expect(vehicle?.markerState).toBe("never-seen");
		expect(vehicle?.lastFixAgeSeconds).toBeNull();
		expect(vehicle?.staleFix).toBe(false);
	});

	it("drops an invalid coordinate but keeps the connection state", () => {
		const zero = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ lastLat: 0, lastLng: 0 }) })],
			[],
			NOW,
		)[0];
		const outOfRange = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ lastLat: 95, lastLng: 123.8854 }) })],
			[],
			NOW,
		)[0];
		const half = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ lastLat: 10.3157, lastLng: null }) })],
			[],
			NOW,
		)[0];

		expect(zero?.position).toBeNull();
		expect(outOfRange?.position).toBeNull();
		expect(half?.position).toBeNull();
		expect(zero?.connectionState).toBe("online");
	});

	it("marks a stale fix separately from a live one", () => {
		const live = buildFleetVehicles([makeVehicle()], [], NOW)[0];
		const stale = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ lastFixAt: new Date("2026-11-22T11:55:00.000Z") }) })],
			[],
			NOW,
		)[0];

		expect(live?.staleFix).toBe(false);
		expect(stale?.staleFix).toBe(true);
		expect(stale?.lastFixAgeSeconds).toBe(300);
	});

	it("flags low battery only below the shared threshold", () => {
		const low = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ batteryV: 11.4 }) })],
			[],
			NOW,
		)[0];
		const healthy = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ batteryV: 11.5 }) })],
			[],
			NOW,
		)[0];

		expect(low?.lowBattery).toBe(true);
		expect(low?.markerState).toBe("low-battery");
		expect(healthy?.lowBattery).toBe(false);
	});

	it("shows weak, offline and never-seen from the heartbeat age", () => {
		const weak = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ lastSeenAt: "2026-11-22T11:57:00.000Z" }) })],
			[],
			NOW,
		)[0];
		const offline = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ lastSeenAt: "2026-11-22T11:50:00.000Z" }) })],
			[],
			NOW,
		)[0];
		const never = buildFleetVehicles(
			[makeVehicle({ device: makeDevice({ lastSeenAt: null }) })],
			[],
			NOW,
		)[0];

		expect(weak?.connectionState).toBe("weak");
		expect(weak?.markerState).toBe("weak");
		expect(offline?.connectionState).toBe("offline");
		expect(offline?.markerState).toBe("offline");
		expect(never?.markerState).toBe("never-seen");
	});

	it("keeps the newest open incident per vehicle and ignores closed ones", () => {
		const incidents = [
			{
				id: "inc-old",
				vehicleId: "veh-01",
				status: "SUSPECTED",
				detectedAt: new Date("2026-11-22T10:00:00.000Z"),
			},
			{
				id: "inc-new",
				vehicleId: "veh-01",
				status: "CONFIRMED",
				detectedAt: new Date("2026-11-22T11:30:00.000Z"),
			},
			{
				id: "inc-closed",
				vehicleId: "veh-01",
				status: "RESOLVED",
				detectedAt: new Date("2026-11-22T11:45:00.000Z"),
			},
			{
				id: "inc-other",
				vehicleId: "veh-02",
				status: "ACKNOWLEDGED",
				detectedAt: new Date("2026-11-22T11:50:00.000Z"),
			},
		];

		const [vehicle] = buildFleetVehicles([makeVehicle()], incidents, NOW);

		expect(OPEN_INCIDENT_STATUSES).toContain("CONFIRMED");
		expect(vehicle?.openIncident).toEqual({
			id: "inc-new",
			status: "CONFIRMED",
			detectedAt: new Date("2026-11-22T11:30:00.000Z"),
		});
		expect(vehicle?.markerState).toBe("incident");
		expect(vehicle?.connectionState).toBe("online");
	});
});

describe("matchesFleetQuery", () => {
	const veh = view();

	it("searches plate, driver, model, tracker label and MAC without case", () => {
		expect(matchesFleetQuery(veh, parseMapQuery({ q: "fdr 2188" }))).toBe(true);
		expect(matchesFleetQuery(veh, parseMapQuery({ q: "ramon" }))).toBe(true);
		expect(matchesFleetQuery(veh, parseMapQuery({ q: "navara" }))).toBe(true);
		expect(matchesFleetQuery(veh, parseMapQuery({ q: "c8:2b:96" }))).toBe(true);
		expect(matchesFleetQuery(veh, parseMapQuery({ q: "hilux" }))).toBe(false);
	});

	it("treats weak as online and never seen as offline", () => {
		const weak = view({ connectionState: "weak" });
		const offline = view({ connectionState: "offline" });
		const never = view({ connectionState: "unknown", markerState: "never-seen" });

		expect(matchesFleetQuery(weak, parseMapQuery({ filter: "online" }))).toBe(true);
		expect(matchesFleetQuery(offline, parseMapQuery({ filter: "online" }))).toBe(false);
		expect(matchesFleetQuery(offline, parseMapQuery({ filter: "offline" }))).toBe(true);
		expect(matchesFleetQuery(never, parseMapQuery({ filter: "offline" }))).toBe(true);
	});

	it("filters low battery and open incidents", () => {
		const low = view({ lowBattery: true, markerState: "low-battery" });
		const incident = view({
			openIncident: { id: "inc-1", status: "CONFIRMED", detectedAt: NOW },
			markerState: "incident",
		});

		expect(matchesFleetQuery(low, parseMapQuery({ filter: "low-battery" }))).toBe(true);
		expect(matchesFleetQuery(veh, parseMapQuery({ filter: "low-battery" }))).toBe(false);
		expect(matchesFleetQuery(incident, parseMapQuery({ filter: "incident" }))).toBe(true);
		expect(matchesFleetQuery(veh, parseMapQuery({ filter: "incident" }))).toBe(false);
	});

	it("combines search and filter", () => {
		const query = parseMapQuery({ q: "navara", filter: "offline" });
		expect(matchesFleetQuery(veh, query)).toBe(false);
		expect(matchesFleetQuery(view({ connectionState: "offline" }), query)).toBe(true);
	});
});

describe("fleet collections", () => {
	it("filters the list without touching the input", () => {
		const vehicles = [
			view({ id: "a", plateNo: "AAA 100", connectionState: "online" }),
			view({ id: "b", plateNo: "BBB 200", connectionState: "offline" }),
		];
		const filtered = filterFleetVehicles(vehicles, parseMapQuery({ filter: "offline" }));

		expect(filtered.map((vehicle) => vehicle.id)).toEqual(["b"]);
		expect(vehicles).toHaveLength(2);
	});

	it("returns only vehicles with a valid position for the map", () => {
		const vehicles = [
			view({ id: "a" }),
			view({ id: "b", position: null }),
			view({ id: "c", position: { lat: 10.32, lng: 123.9 } }),
		];

		expect(vehiclesWithPosition(vehicles).map((vehicle) => vehicle.id)).toEqual(["a", "c"]);
	});
});
