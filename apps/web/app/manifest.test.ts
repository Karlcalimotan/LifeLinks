import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const app = manifest();

function icon(sizes: string, purpose: string) {
	return app.icons?.find((entry) => entry.sizes === sizes && entry.purpose === purpose);
}

describe("app manifest", () => {
	it("is installable with the agreed identity and scope", () => {
		expect(app.name).toBe("LifeLink");
		expect(app.short_name).toBe("LifeLink");
		expect(app.description).toBeTruthy();
		expect(app.id).toBe("/");
		expect(app.start_url).toBe("/");
		expect(app.scope).toBe("/");
		expect(app.display).toBe("standalone");
		expect(app.display_override).toContain("standalone");
		expect(app.orientation).toBe("any");
		expect(app.background_color).toBe("#071013");
		expect(app.theme_color).toBe("#071013");
	});

	it("does not bake a locale into the launch URL", () => {
		expect(String(app.start_url)).not.toMatch(/^\/(en|tl)\//);
		expect(String(app.scope)).toBe("/");
	});

	it("ships the required PNG icon sizes and purposes", () => {
		expect(icon("192x192", "any")).toEqual({
			src: "/icons/icon-192.png",
			sizes: "192x192",
			type: "image/png",
			purpose: "any",
		});
		expect(icon("512x512", "any")).toEqual({
			src: "/icons/icon-512.png",
			sizes: "512x512",
			type: "image/png",
			purpose: "any",
		});
		expect(icon("512x512", "maskable")).toEqual({
			src: "/icons/icon-maskable-512.png",
			sizes: "512x512",
			type: "image/png",
			purpose: "maskable",
		});
		expect(icon("180x180", "any")).toEqual({
			src: "/icons/apple-touch-icon.png",
			sizes: "180x180",
			type: "image/png",
			purpose: "any",
		});
	});
});
