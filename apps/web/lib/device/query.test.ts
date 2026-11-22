import { describe, expect, it } from "vitest";
import {
	DEVICE_PAGE_SIZE,
	LOW_BATTERY_V,
	buildDevicesHref,
	deviceOrderBy,
	deviceWhere,
	hasActiveFilters,
	parseDevicesQuery,
} from "./query";

const base = parseDevicesQuery({});

describe("parseDevicesQuery", () => {
	it("returns safe defaults for an empty query", () => {
		expect(base).toEqual({
			q: "",
			approval: null,
			connection: null,
			assigned: null,
			battery: null,
			sort: "lastSeen",
			dir: "desc",
			page: 1,
			pageSize: DEVICE_PAGE_SIZE,
		});
	});

	it("ignores invalid filters, sort and page values", () => {
		const query = parseDevicesQuery({
			approval: "SUSPENDED",
			connection: "sleeping",
			assigned: "maybe",
			battery: "full",
			sort: "createdAt",
			dir: "sideways",
			page: "-4",
		});

		expect(query.approval).toBeNull();
		expect(query.connection).toBeNull();
		expect(query.assigned).toBeNull();
		expect(query.battery).toBeNull();
		expect(query.sort).toBe("lastSeen");
		expect(query.dir).toBe("desc");
		expect(query.page).toBe(1);
	});

	it("normalizes valid filters and the first value of an array", () => {
		const query = parseDevicesQuery({
			q: ["  navara  ", "ignored"],
			approval: ["approved", "pending"],
			connection: "WEAK",
			assigned: "YES",
			battery: "LOW",
			sort: "battery",
			dir: "ASC",
			page: "3",
		});

		expect(query.q).toBe("navara");
		expect(query.approval).toBe("APPROVED");
		expect(query.connection).toBe("weak");
		expect(query.assigned).toBe("yes");
		expect(query.battery).toBe("low");
		expect(query.sort).toBe("battery");
		expect(query.dir).toBe("asc");
		expect(query.page).toBe(3);
	});
});

describe("deviceWhere", () => {
	const now = new Date("2026-11-22T12:00:00.000Z");

	it("scopes to the organization and searches label, MAC and plate", () => {
		const where = deviceWhere("org-1", parseDevicesQuery({ q: "navara" }), now);

		expect(where.orgId).toBe("org-1");
		expect(where.OR).toEqual([
			{ label: { contains: "navara", mode: "insensitive" } },
			{ mac: { contains: "NAVARA" } },
			{ vehicle: { plateNo: { contains: "navara", mode: "insensitive" } } },
		]);
	});

	it("combines approval, assigned and low-battery filters", () => {
		const where = deviceWhere(
			"org-1",
			parseDevicesQuery({ approval: "PENDING", assigned: "no", battery: "low" }),
			now,
		);

		expect(where.approvalStatus).toBe("PENDING");
		expect(where.vehicleId).toBeNull();
		expect(where.batteryV).toEqual({ lt: LOW_BATTERY_V });
	});

	it("maps connection filters to lastSeenAt cutoffs", () => {
		expect(
			deviceWhere("org-1", parseDevicesQuery({ connection: "online" }), now).lastSeenAt,
		).toEqual({ gte: new Date("2026-11-22T11:58:00.000Z") });
		expect(deviceWhere("org-1", parseDevicesQuery({ connection: "weak" }), now).lastSeenAt).toEqual(
			{
				lt: new Date("2026-11-22T11:58:00.000Z"),
				gte: new Date("2026-11-22T11:55:00.000Z"),
			},
		);
		expect(
			deviceWhere("org-1", parseDevicesQuery({ connection: "offline" }), now).lastSeenAt,
		).toEqual({ lt: new Date("2026-11-22T11:55:00.000Z") });
		expect(
			deviceWhere("org-1", parseDevicesQuery({ connection: "never" }), now).lastSeenAt,
		).toBeNull();
	});
});

describe("deviceOrderBy", () => {
	it("uses the selected field with nulls last and an id tiebreaker", () => {
		expect(deviceOrderBy(parseDevicesQuery({ sort: "lastSeen", dir: "asc" }))).toEqual([
			{ lastSeenAt: { sort: "asc", nulls: "last" } },
			{ id: "asc" },
		]);
		expect(deviceOrderBy(parseDevicesQuery({ sort: "battery", dir: "desc" }))).toEqual([
			{ batteryV: { sort: "desc", nulls: "last" } },
			{ id: "asc" },
		]);
		expect(deviceOrderBy(parseDevicesQuery({ sort: "label", dir: "asc" }))).toEqual([
			{ label: "asc" },
			{ id: "asc" },
		]);
	});
});

describe("buildDevicesHref", () => {
	it("omits defaults", () => {
		expect(buildDevicesHref(base)).toBe("/devices");
	});

	it("keeps filters and omits the default sort, direction and page", () => {
		const href = buildDevicesHref(
			parseDevicesQuery({ q: "navara 4x4", approval: "APPROVED", page: "1" }),
		);
		const params = new URLSearchParams(href.split("?")[1]);

		expect(href.startsWith("/devices?")).toBe(true);
		expect(params.get("q")).toBe("navara 4x4");
		expect(params.get("approval")).toBe("APPROVED");
		expect(params.get("sort")).toBeNull();
		expect(params.get("dir")).toBeNull();
		expect(params.get("page")).toBeNull();
	});

	it("includes a non-default sort, direction and page", () => {
		const href = buildDevicesHref(parseDevicesQuery({ sort: "label", dir: "asc", page: "3" }));
		const params = new URLSearchParams(href.split("?")[1]);

		expect(params.get("sort")).toBe("label");
		expect(params.get("dir")).toBe("asc");
		expect(params.get("page")).toBe("3");
	});

	it("applies overrides for pagination and clearing filters", () => {
		const query = parseDevicesQuery({ q: "navara", approval: "PENDING", page: "2" });
		const next = buildDevicesHref(query, { page: 3 });
		const cleared = buildDevicesHref(query, {
			q: "",
			approval: null,
			page: 1,
		});

		expect(new URLSearchParams(next.split("?")[1]).get("page")).toBe("3");
		expect(cleared).toBe("/devices");
	});
});

describe("hasActiveFilters", () => {
	it("is false only when no filter is set", () => {
		expect(hasActiveFilters(base)).toBe(false);
		expect(hasActiveFilters(parseDevicesQuery({ q: "navara" }))).toBe(true);
		expect(hasActiveFilters(parseDevicesQuery({ connection: "offline" }))).toBe(true);
	});
});
