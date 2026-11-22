import {
	type DeviceConnectionState,
	batteryBand,
	deviceConnectionState,
	gpsAgeSeconds,
	isGpsStale,
} from "@/lib/device/status";
import { isValidCoordinate } from "@/lib/geo";
import type { MapQuery } from "./query";

/**
 * View models for the live map. Everything here is pure: the page loads rows,
 * this module decides marker state, filter matches and the selected panel
 * values so each rule can be tested without a database.
 */

export const OPEN_INCIDENT_STATUSES = ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED"] as const;

export const MARKER_STATES = [
	"online",
	"weak",
	"low-battery",
	"offline",
	"never-seen",
	"incident",
] as const;
export type MarkerState = (typeof MARKER_STATES)[number];

export interface FleetDeviceInput {
	id: string;
	label: string;
	mac: string;
	lastSeenAt: Date | string | null;
	lastLat: number | null;
	lastLng: number | null;
	lastFixAt: Date | string | null;
	lastSpeedKph: number | null;
	batteryV: number | null;
	rssiDbm: number | null;
	satellites: number | null;
}

export interface FleetVehicleInput {
	id: string;
	plateNo: string;
	make: string;
	model: string;
	year: number | null;
	driverName: string | null;
	driverPhone: string | null;
	device: FleetDeviceInput | null;
}

export interface OpenIncidentInput {
	id: string;
	vehicleId: string;
	status: string;
	detectedAt: Date | string;
}

export interface OpenIncidentView {
	id: string;
	status: string;
	detectedAt: Date | string;
}

export interface FleetVehicleView {
	id: string;
	plateNo: string;
	make: string;
	model: string;
	year: number | null;
	driverName: string | null;
	driverPhone: string | null;
	device: FleetDeviceInput | null;
	position: { lat: number; lng: number } | null;
	connectionState: DeviceConnectionState;
	markerState: MarkerState;
	lowBattery: boolean;
	staleFix: boolean;
	lastFixAgeSeconds: number | null;
	openIncident: OpenIncidentView | null;
}

function timeOf(value: Date | string): number {
	const time = new Date(value).getTime();
	return Number.isNaN(time) ? 0 : time;
}

/**
 * Incident first: an operator must not see "online" on a vehicle that is in an
 * open incident. A connected device with low battery is "low-battery"; a device
 * that has never reported is "never-seen"; an offline device is "offline" even
 * if its last battery reading was low.
 */
export function markerStateFor(
	connection: DeviceConnectionState,
	lowBattery: boolean,
	hasOpenIncident: boolean,
): MarkerState {
	if (hasOpenIncident) return "incident";
	if (connection === "unknown") return "never-seen";
	if (connection === "offline") return "offline";
	if (lowBattery) return "low-battery";
	if (connection === "weak") return "weak";
	return "online";
}

function latestOpenIncident(
	incidents: readonly OpenIncidentInput[],
): Map<string, OpenIncidentInput> {
	const latest = new Map<string, OpenIncidentInput>();
	for (const incident of incidents) {
		if (!(OPEN_INCIDENT_STATUSES as readonly string[]).includes(incident.status)) continue;
		const current = latest.get(incident.vehicleId);
		if (!current || timeOf(incident.detectedAt) > timeOf(current.detectedAt)) {
			latest.set(incident.vehicleId, incident);
		}
	}
	return latest;
}

export function buildFleetVehicles(
	vehicles: readonly FleetVehicleInput[],
	incidents: readonly OpenIncidentInput[] = [],
	now = new Date(),
): FleetVehicleView[] {
	const openIncidents = latestOpenIncident(incidents);

	return vehicles.map((vehicle) => {
		const device = vehicle.device;
		const connectionState = deviceConnectionState(device?.lastSeenAt, now);
		const band = batteryBand(device?.batteryV);
		const lowBattery = band === "low" || band === "critical";
		const incident = openIncidents.get(vehicle.id) ?? null;
		const position =
			device &&
			device.lastLat != null &&
			device.lastLng != null &&
			isValidCoordinate(device.lastLat, device.lastLng)
				? { lat: device.lastLat, lng: device.lastLng }
				: null;

		return {
			id: vehicle.id,
			plateNo: vehicle.plateNo,
			make: vehicle.make,
			model: vehicle.model,
			year: vehicle.year,
			driverName: vehicle.driverName,
			driverPhone: vehicle.driverPhone,
			device,
			position,
			connectionState,
			markerState: markerStateFor(connectionState, lowBattery, incident !== null),
			lowBattery,
			staleFix: position !== null && isGpsStale(device?.lastFixAt, now),
			lastFixAgeSeconds: gpsAgeSeconds(device?.lastFixAt, now),
			openIncident: incident
				? { id: incident.id, status: incident.status, detectedAt: incident.detectedAt }
				: null,
		};
	});
}

function searchText(vehicle: FleetVehicleView): string {
	return [
		vehicle.plateNo,
		vehicle.make,
		vehicle.model,
		vehicle.driverName ?? "",
		vehicle.device?.label ?? "",
		vehicle.device?.mac ?? "",
	]
		.join(" ")
		.toLowerCase();
}

/**
 * "Online" means the tracker is reporting, including a weak signal. "Offline"
 * covers both a timed-out heartbeat and a tracker that has never reported, so
 * the operator can answer "which vehicles are not reporting" in one filter.
 */
export function matchesFleetQuery(vehicle: FleetVehicleView, query: MapQuery): boolean {
	const needle = query.q.trim().toLowerCase();
	if (needle && !searchText(vehicle).includes(needle)) return false;

	switch (query.filter) {
		case "online":
			return vehicle.connectionState === "online" || vehicle.connectionState === "weak";
		case "offline":
			return vehicle.connectionState === "offline" || vehicle.connectionState === "unknown";
		case "low-battery":
			return vehicle.lowBattery;
		case "incident":
			return vehicle.openIncident !== null;
		default:
			return true;
	}
}

export function filterFleetVehicles(
	vehicles: readonly FleetVehicleView[],
	query: MapQuery,
): FleetVehicleView[] {
	return vehicles.filter((vehicle) => matchesFleetQuery(vehicle, query));
}

export type FleetVehicleWithPosition = FleetVehicleView & {
	position: { lat: number; lng: number };
};

export function vehiclesWithPosition(
	vehicles: readonly FleetVehicleView[],
): FleetVehicleWithPosition[] {
	return vehicles.filter(
		(vehicle): vehicle is FleetVehicleWithPosition => vehicle.position !== null,
	);
}
