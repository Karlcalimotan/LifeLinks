import { describe, expect, it } from "vitest";
import {
	deviceSearchResult,
	incidentSearchResult,
	parseSearchResults,
	vehicleSearchResult,
} from "./shape";

describe("vehicleSearchResult", () => {
	it("shapes a vehicle with driver and model", () => {
		expect(
			vehicleSearchResult({
				id: "veh-1",
				plateNo: "ABC 123",
				driverName: "R. Alvarez",
				make: "Nissan",
				model: "Navara",
			}),
		).toEqual({
			type: "vehicle",
			id: "veh-1",
			title: "ABC 123",
			subtitle: "Nissan Navara",
			meta: "R. Alvarez",
			href: "/vehicles/veh-1",
			status: null,
			timestamp: null,
		});
	});

	it("drops an empty model and driver", () => {
		const shaped = vehicleSearchResult({
			id: "veh-2",
			plateNo: "XYZ 987",
			driverName: "  ",
			make: "Toyota",
			model: " ",
		});
		expect(shaped.subtitle).toBe("Toyota");
		expect(shaped.meta).toBeNull();
	});
});

describe("incidentSearchResult", () => {
	it("shapes an incident with its plate, id, status and fixed timestamp", () => {
		const detectedAt = new Date("2026-11-23T06:15:00.000Z");
		expect(
			incidentSearchResult({
				id: "incident-1",
				clientIncidentId: "device-ref-1",
				status: "SUSPECTED",
				detectedAt,
				vehicle: { plateNo: "ABC 123" },
			}),
		).toEqual({
			type: "incident",
			id: "incident-1",
			title: "ABC 123",
			subtitle: "#incident-1",
			meta: "device-ref-1",
			href: "/incidents/incident-1",
			status: "SUSPECTED",
			timestamp: detectedAt.toISOString(),
		});
	});
});

describe("deviceSearchResult", () => {
	it("uppercases the MAC and links to the tracker page", () => {
		expect(
			deviceSearchResult({
				id: "device-1",
				label: "Navara unit",
				mac: "aabbccddeeff",
				approvalStatus: "APPROVED",
				vehicle: { plateNo: "ABC 123" },
			}),
		).toEqual({
			type: "device",
			id: "device-1",
			title: "Navara unit",
			subtitle: "AABBCCDDEEFF",
			meta: "ABC 123",
			href: "/devices/device-1",
			status: "APPROVED",
			timestamp: null,
		});
	});

	it("keeps an unassigned tracker searchable", () => {
		const shaped = deviceSearchResult({
			id: "device-2",
			label: "Spare",
			mac: "112233445566",
			approvalStatus: "PENDING",
			vehicle: null,
		});
		expect(shaped.meta).toBeNull();
	});
});

describe("parseSearchResults", () => {
	it("keeps well-formed rows and fills optional fields", () => {
		expect(
			parseSearchResults([
				{
					type: "vehicle",
					id: "veh-1",
					title: "ABC 123",
					href: "/vehicles/veh-1",
					subtitle: "Nissan Navara",
				},
			]),
		).toEqual([
			{
				type: "vehicle",
				id: "veh-1",
				title: "ABC 123",
				subtitle: "Nissan Navara",
				meta: null,
				href: "/vehicles/veh-1",
				status: null,
				timestamp: null,
			},
		]);
	});

	it("drops malformed rows instead of throwing", () => {
		expect(
			parseSearchResults([
				null,
				"row",
				{ type: "unknown", id: "1", title: "x", href: "/x" },
				{ type: "device", id: 1, title: "x", href: "/x" },
				{ type: "device", id: "2", title: "x" },
			]),
		).toEqual([]);
	});

	it("returns an empty list for a non-array payload", () => {
		expect(parseSearchResults({ results: [] })).toEqual([]);
	});
});
