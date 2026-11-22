import { describe, expect, it } from "vitest";
import {
	NOTIFICATION_MAX_PAGE,
	NOTIFICATION_PAGE_SIZE,
	buildNotificationsHref,
	clampPagination,
	hasActiveFilters,
	notificationsWhere,
	parseNotificationsQuery,
} from "./query";

const base = parseNotificationsQuery({});

describe("parseNotificationsQuery", () => {
	it("returns safe defaults for an empty query", () => {
		expect(base).toEqual({
			status: null,
			channel: null,
			page: 1,
			pageSize: NOTIFICATION_PAGE_SIZE,
		});
	});

	it("ignores invalid filters and page values", () => {
		const query = parseNotificationsQuery({
			status: "DELIVERED",
			channel: "PUSH",
			page: "not-a-number",
		});

		expect(query.status).toBeNull();
		expect(query.channel).toBeNull();
		expect(query.page).toBe(1);
	});

	it("normalizes filters and keeps the first array entry", () => {
		const query = parseNotificationsQuery({
			status: ["sent", "failed"],
			channel: ["email", "sms"],
			page: "3",
		});

		expect(query.status).toBe("SENT");
		expect(query.channel).toBe("EMAIL");
		expect(query.page).toBe(3);
	});

	it("bounds the page to one and the maximum page", () => {
		expect(parseNotificationsQuery({ page: "0" }).page).toBe(1);
		expect(parseNotificationsQuery({ page: "-4" }).page).toBe(1);
		expect(parseNotificationsQuery({ page: String(NOTIFICATION_MAX_PAGE + 50) }).page).toBe(
			NOTIFICATION_MAX_PAGE,
		);
	});
});

describe("notificationsWhere", () => {
	it("scopes through the incident and maps status and channel", () => {
		expect(
			notificationsWhere("org-1", parseNotificationsQuery({ status: "FAILED", channel: "SMS" })),
		).toEqual({
			impact: { orgId: "org-1" },
			status: "FAILED",
			channel: "SMS",
		});
	});

	it("leaves the filters out when none are selected", () => {
		expect(notificationsWhere("org-1", base)).toEqual({ impact: { orgId: "org-1" } });
	});
});

describe("clampPagination", () => {
	it("returns an empty first page for an empty log", () => {
		expect(clampPagination(0, 4)).toEqual({
			page: 1,
			pageCount: 1,
			skip: 0,
			from: 0,
			to: 0,
		});
	});

	it("clamps a page beyond the last page", () => {
		expect(clampPagination(60, 99)).toEqual({
			page: 3,
			pageCount: 3,
			skip: 50,
			from: 51,
			to: 60,
		});
	});

	it("computes the slice for a middle page", () => {
		expect(clampPagination(60, 2)).toEqual({
			page: 2,
			pageCount: 3,
			skip: 25,
			from: 26,
			to: 50,
		});
	});

	it("clamps a page below one", () => {
		expect(clampPagination(10, 0)).toMatchObject({ page: 1, skip: 0, from: 1, to: 10 });
	});
});

describe("buildNotificationsHref", () => {
	it("omits defaults", () => {
		expect(buildNotificationsHref(base)).toBe("/notifications");
	});

	it("keeps filters and page in the URL", () => {
		const query = parseNotificationsQuery({ status: "queued", channel: "sms", page: "2" });
		const params = new URLSearchParams(buildNotificationsHref(query).split("?")[1]);

		expect(params.get("status")).toBe("QUEUED");
		expect(params.get("channel")).toBe("SMS");
		expect(params.get("page")).toBe("2");
	});

	it("applies overrides for pagination and clearing", () => {
		const query = parseNotificationsQuery({ status: "FAILED", page: "2" });

		expect(
			new URLSearchParams(buildNotificationsHref(query, { page: 3 }).split("?")[1]).get("page"),
		).toBe("3");
		expect(buildNotificationsHref(query, { status: null, page: 1 })).toBe("/notifications");
	});
});

describe("hasActiveFilters", () => {
	it("is false only when no filter is set", () => {
		expect(hasActiveFilters(base)).toBe(false);
		expect(hasActiveFilters(parseNotificationsQuery({ status: "SENT" }))).toBe(true);
		expect(hasActiveFilters(parseNotificationsQuery({ channel: "EMAIL" }))).toBe(true);
	});
});
