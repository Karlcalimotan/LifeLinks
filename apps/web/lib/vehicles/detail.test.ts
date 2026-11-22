import { describe, expect, it } from "vitest";
import {
	buildVehicleHref,
	maintenanceActionFor,
	maintenanceTarget,
	parseVehicleTab,
} from "./detail";

describe("vehicle tabs", () => {
	it("accepts the four tabs and falls back to overview", () => {
		expect(parseVehicleTab("overview")).toBe("overview");
		expect(parseVehicleTab("trips")).toBe("trips");
		expect(parseVehicleTab("incidents")).toBe("incidents");
		expect(parseVehicleTab("settings")).toBe("settings");
		expect(parseVehicleTab(["settings"])).toBe("settings");
	});

	it("ignores unknown, empty and missing tabs", () => {
		expect(parseVehicleTab(undefined)).toBe("overview");
		expect(parseVehicleTab("")).toBe("overview");
		expect(parseVehicleTab("documents")).toBe("overview");
		expect(parseVehicleTab("Settings")).toBe("overview");
	});

	it("omits the default tab from the URL", () => {
		expect(buildVehicleHref("veh-1", "overview")).toBe("/vehicles/veh-1");
		expect(buildVehicleHref("veh-1", "trips")).toBe("/vehicles/veh-1?tab=trips");
		expect(buildVehicleHref("veh-1", "incidents")).toBe("/vehicles/veh-1?tab=incidents");
		expect(buildVehicleHref("veh-1", "settings")).toBe("/vehicles/veh-1?tab=settings");
	});
});

describe("maintenance transitions", () => {
	it("maps the current status to the one action the UI offers", () => {
		expect(maintenanceActionFor("ACTIVE")).toBe("enable");
		expect(maintenanceActionFor("MAINTENANCE")).toBe("disable");
		expect(maintenanceActionFor("RETIRED")).toBeNull();
		expect(maintenanceActionFor("UNKNOWN")).toBeNull();
	});

	it("moves only between active and maintenance", () => {
		expect(maintenanceTarget("ACTIVE", "enable")).toBe("MAINTENANCE");
		expect(maintenanceTarget("MAINTENANCE", "disable")).toBe("ACTIVE");
	});

	it("rejects no-op and retired transitions", () => {
		expect(maintenanceTarget("ACTIVE", "disable")).toBeNull();
		expect(maintenanceTarget("MAINTENANCE", "enable")).toBeNull();
		expect(maintenanceTarget("RETIRED", "enable")).toBeNull();
		expect(maintenanceTarget("RETIRED", "disable")).toBeNull();
		expect(maintenanceTarget("UNKNOWN", "enable")).toBeNull();
	});
});
