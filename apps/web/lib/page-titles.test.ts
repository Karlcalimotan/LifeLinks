import en from "@/messages/en.json";
import tl from "@/messages/tl.json";
import { describe, expect, it } from "vitest";
import { PAGE_TITLES } from "./page-titles";

type Catalog = Record<string, unknown>;

function read(catalog: Catalog, namespace: string, key: string): string | undefined {
	const group = catalog[namespace];
	if (typeof group !== "object" || group === null) return undefined;
	const value = (group as Record<string, unknown>)[key];
	return typeof value === "string" ? value : undefined;
}

describe("PAGE_TITLES", () => {
	it.each(Object.entries(PAGE_TITLES))("resolves the %s title in both locales", (route, entry) => {
		const english = read(en, entry.namespace, entry.key);
		const tagalog = read(tl, entry.namespace, entry.key);
		expect(english, `${route} is missing in en.json`).toBeTruthy();
		expect(tagalog, `${route} is missing in tl.json`).toBeTruthy();
		expect(english?.trim()).not.toBe("");
		expect(tagalog?.trim()).not.toBe("");
	});

	it("does not reuse a title key across routes", () => {
		const keys = Object.values(PAGE_TITLES).map((entry) => `${entry.namespace}.${entry.key}`);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
