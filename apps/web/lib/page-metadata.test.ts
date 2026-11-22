import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn(
		async ({ namespace }: { locale: string; namespace: string }) =>
			(key: string) =>
				`${namespace}.${key}`,
	),
}));

import { metadataForPage } from "./page-metadata";

describe("metadataForPage", () => {
	it("returns the translated page title for the route namespace", async () => {
		await expect(metadataForPage("tl", "map")).resolves.toEqual({ title: "map.title" });
	});

	it("keeps the locale in the lookup", async () => {
		const { getTranslations } = await import("next-intl/server");
		await metadataForPage("en", "incidents");
		expect(getTranslations).toHaveBeenCalledWith({ locale: "en", namespace: "incidents" });
	});
});
