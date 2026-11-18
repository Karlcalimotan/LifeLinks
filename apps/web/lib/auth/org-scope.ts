import "server-only";

import prisma from "@/lib/prisma";

/** Resolve a vehicle only when it belongs to the caller's organization. */
export async function assertVehicleInOrg(orgId: string, vehicleId: string) {
	const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, orgId } });
	if (!vehicle) throw new Error("Vehicle not found in this organization.");
	return vehicle;
}

/** Resolve a device only when it belongs to the caller's organization. */
export async function assertDeviceInOrg(orgId: string, deviceId: string) {
	const device = await prisma.trackerDevice.findFirst({ where: { id: deviceId, orgId } });
	if (!device) throw new Error("Device not found in this organization.");
	return device;
}

/** Resolve an incident only when it belongs to the caller's organization. */
export async function assertIncidentInOrg(orgId: string, incidentId: string) {
	const incident = await prisma.impactEvent.findFirst({ where: { id: incidentId, orgId } });
	if (!incident) throw new Error("Incident not found in this organization.");
	return incident;
}
