import { canAdminister, canManageIncidents } from "@/lib/auth/roles";
import { describe, expect, it } from "vitest";
import {
	AUDIT_PAGE_SIZE,
	PERMISSION_ROLE_ORDER,
	buildSettingsHref,
	clampAuditPage,
	parseAuditQuery,
	parseSettingsTab,
	permissionMatrix,
} from "./workspace";

describe("settings tab parsing", () => {
	it("accepts every known tab", () => {
		expect(parseSettingsTab("organization")).toBe("organization");
		expect(parseSettingsTab("thresholds")).toBe("thresholds");
		expect(parseSettingsTab("retention")).toBe("retention");
		expect(parseSettingsTab("members")).toBe("members");
		expect(parseSettingsTab("audit")).toBe("audit");
		expect(parseSettingsTab("health")).toBe("health");
	});

	it("falls back to organization for unknown or missing values", () => {
		expect(parseSettingsTab(undefined)).toBe("organization");
		expect(parseSettingsTab("")).toBe("organization");
		expect(parseSettingsTab("billing")).toBe("organization");
		expect(parseSettingsTab("MEMBERS")).toBe("organization");
	});

	it("uses the first value when the query repeats a parameter", () => {
		expect(parseSettingsTab(["audit", "health"])).toBe("audit");
	});
});

describe("audit query parsing", () => {
	it("trims the action filter and defaults to page 1", () => {
		expect(parseAuditQuery({})).toEqual({ action: "", page: 1 });
		expect(parseAuditQuery({ action: "  settings.updated  " })).toEqual({
			action: "settings.updated",
			page: 1,
		});
	});

	it("rejects page values that are not positive integers", () => {
		expect(parseAuditQuery({ page: "0" }).page).toBe(1);
		expect(parseAuditQuery({ page: "-3" }).page).toBe(1);
		expect(parseAuditQuery({ page: "abc" }).page).toBe(1);
		expect(parseAuditQuery({ page: "2.9" }).page).toBe(2);
		expect(parseAuditQuery({ page: "4" }).page).toBe(4);
	});

	it("caps the action filter length", () => {
		expect(parseAuditQuery({ action: "x".repeat(200) }).action).toHaveLength(80);
	});
});

describe("audit page clamping", () => {
	it("keeps a valid page and computes the offset", () => {
		expect(clampAuditPage(2, 41)).toEqual({
			page: 2,
			pageCount: 3,
			skip: AUDIT_PAGE_SIZE,
			take: AUDIT_PAGE_SIZE,
		});
	});

	it("clamps beyond the last page to the last page", () => {
		expect(clampAuditPage(99, 41)).toEqual({
			page: 3,
			pageCount: 3,
			skip: AUDIT_PAGE_SIZE * 2,
			take: AUDIT_PAGE_SIZE,
		});
	});

	it("keeps an empty log on page 1 with no offset", () => {
		expect(clampAuditPage(4, 0)).toEqual({
			page: 1,
			pageCount: 1,
			skip: 0,
			take: AUDIT_PAGE_SIZE,
		});
	});

	it("normalises invalid page numbers", () => {
		expect(clampAuditPage(Number.NaN, 10).page).toBe(1);
		expect(clampAuditPage(0, 10).page).toBe(1);
		expect(clampAuditPage(-2, 10).page).toBe(1);
	});
});

describe("settings hrefs", () => {
	it("omits the default tab", () => {
		expect(buildSettingsHref("organization")).toBe("/settings");
	});

	it("keeps audit filters and pages in the URL", () => {
		expect(buildSettingsHref("audit", { action: "settings.updated", page: 2 })).toBe(
			"/settings?tab=audit&action=settings.updated&page=2",
		);
	});

	it("omits the first page and an empty filter", () => {
		expect(buildSettingsHref("audit", { action: "  ", page: 1 })).toBe("/settings?tab=audit");
	});
});

describe("permission matrix", () => {
	it("derives every cell from the enforced role helpers", () => {
		const rows = permissionMatrix();
		expect(rows.map((row) => row.key)).toEqual(["incidents", "administration"]);

		const byKey = new Map(rows.map((row) => [row.key, row]));
		for (const role of PERMISSION_ROLE_ORDER) {
			expect(byKey.get("incidents")?.roles[role]).toBe(canManageIncidents(role));
			expect(byKey.get("administration")?.roles[role]).toBe(canAdminister(role));
		}
	});

	it("shows the expected grants for each role", () => {
		const rows = permissionMatrix();
		const incidents = rows.find((row) => row.key === "incidents");
		const administration = rows.find((row) => row.key === "administration");

		expect(incidents?.roles).toEqual({ USER: true, RESPONDER: true, ADMIN: true });
		expect(administration?.roles).toEqual({ USER: false, RESPONDER: false, ADMIN: true });
	});
});
