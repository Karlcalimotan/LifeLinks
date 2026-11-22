import { describe, expect, it } from "vitest";
import {
	DEFAULT_MAP_FRAME,
	MAP_HEIGHT,
	MAP_PADDING,
	MAP_WIDTH,
	MIN_BOUNDS_SPAN_DEG,
	boundsFor,
	formatBounds,
	placeLabel,
	projectPoint,
	projectPoints,
} from "./projection";

const PH = { lat: 10.3157, lng: 123.8854 };

describe("boundsFor", () => {
	it("returns null when there is nothing to map", () => {
		expect(boundsFor([])).toBeNull();
		expect(boundsFor([null, undefined])).toBeNull();
	});

	it("expands a single point to the minimum span, centred on it", () => {
		const bounds = boundsFor([PH]);
		expect(bounds).not.toBeNull();
		expect(bounds?.minLat).toBeCloseTo(PH.lat - MIN_BOUNDS_SPAN_DEG / 2, 9);
		expect(bounds?.maxLat).toBeCloseTo(PH.lat + MIN_BOUNDS_SPAN_DEG / 2, 9);
		expect(bounds?.minLng).toBeCloseTo(PH.lng - MIN_BOUNDS_SPAN_DEG / 2, 9);
		expect(bounds?.maxLng).toBeCloseTo(PH.lng + MIN_BOUNDS_SPAN_DEG / 2, 9);
	});

	it("uses the exact extent for multiple points", () => {
		const bounds = boundsFor([
			{ lat: 10.3, lng: 122.0 },
			{ lat: 10.35, lng: 122.1 },
			{ lat: 10.32, lng: 122.05 },
		]);
		expect(bounds).toEqual({ minLat: 10.3, maxLat: 10.35, minLng: 122.0, maxLng: 122.1 });
	});

	it("pads only the axis that is degenerate", () => {
		const bounds = boundsFor([
			{ lat: 10.3, lng: 122.0 },
			{ lat: 10.3, lng: 122.2 },
		]);
		expect(bounds?.minLat).toBeCloseTo(10.3 - MIN_BOUNDS_SPAN_DEG / 2, 9);
		expect(bounds?.maxLat).toBeCloseTo(10.3 + MIN_BOUNDS_SPAN_DEG / 2, 9);
		expect(bounds?.minLng).toBe(122.0);
		expect(bounds?.maxLng).toBe(122.2);
	});

	it("excludes missing and invalid coordinates", () => {
		const bounds = boundsFor([
			{ lat: 10.3, lng: 122.0 },
			{ lat: Number.NaN, lng: 122.1 },
			{ lat: 10.4, lng: Number.POSITIVE_INFINITY },
			{ lat: 95, lng: 122.2 },
			{ lat: 0, lng: 0 },
		]);
		expect(bounds).not.toBeNull();
		expect(bounds?.minLat).toBeCloseTo(10.3 - MIN_BOUNDS_SPAN_DEG / 2, 9);
		expect(bounds?.maxLat).toBeCloseTo(10.3 + MIN_BOUNDS_SPAN_DEG / 2, 9);
	});
});

describe("projectPoint", () => {
	const bounds = { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };

	it("maps the corners inside the padded frame", () => {
		expect(projectPoint({ lat: 0, lng: 0 }, bounds)).toEqual({
			x: MAP_PADDING,
			y: MAP_HEIGHT - MAP_PADDING,
		});
		expect(projectPoint({ lat: 1, lng: 1 }, bounds)).toEqual({
			x: MAP_WIDTH - MAP_PADDING,
			y: MAP_PADDING,
		});
	});

	it("maps the centre to the centre of the frame", () => {
		const point = projectPoint({ lat: 0.5, lng: 0.5 }, bounds);
		expect(point.x).toBeCloseTo(MAP_WIDTH / 2, 6);
		expect(point.y).toBeCloseTo(MAP_HEIGHT / 2, 6);
	});

	it("clamps points that fall outside the bounds", () => {
		expect(projectPoint({ lat: 4, lng: -3 }, bounds)).toEqual({
			x: MAP_PADDING,
			y: MAP_PADDING,
		});
	});
});

describe("placeLabel", () => {
	it("places the label to the right away from the edge", () => {
		const label = placeLabel({ x: 400, y: 200 });
		expect(label.labelAnchor).toBe("start");
		expect(label.labelX).toBe(414);
		expect(label.labelY).toBe(200);
	});

	it("flips the label to the left near the right edge", () => {
		const label = placeLabel({ x: MAP_WIDTH - MAP_PADDING, y: 100 });
		expect(label.labelAnchor).toBe("end");
		expect(label.labelX).toBe(MAP_WIDTH - MAP_PADDING - 14);
	});
});

describe("projectPoints", () => {
	it("returns null when every point is invalid", () => {
		expect(projectPoints([{ id: "a", lat: 0, lng: 0 }])).toBeNull();
	});

	it("drops invalid points, keeps ids and places labels", () => {
		const projected = projectPoints([
			{ id: "a", lat: 10.3, lng: 122.0 },
			{ id: "b", lat: 10.4, lng: 122.2 },
			{ id: "c", lat: Number.NaN, lng: 122.1 },
		]);

		expect(projected?.points.map((point) => point.id)).toEqual(["a", "b"]);
		expect(projected?.points[0]?.x).toBe(MAP_PADDING);
		expect(projected?.points[0]?.labelAnchor).toBe("start");
		expect(projected?.points[1]?.x).toBe(MAP_WIDTH - MAP_PADDING);
		expect(projected?.points[1]?.labelAnchor).toBe("end");
	});

	it("uses a custom frame for padding", () => {
		const frame = { ...DEFAULT_MAP_FRAME, width: 400, height: 200, padding: 20 };
		const projected = projectPoints([{ id: "a", lat: 10.3, lng: 122.0 }], frame);
		expect(projected?.points[0]?.x).toBe(200);
		expect(projected?.points[0]?.y).toBe(100);
	});
});

describe("formatBounds", () => {
	it("prints a compact degree extent with hemispheres", () => {
		const text = formatBounds({
			minLat: 10.6812,
			maxLat: 10.7245,
			minLng: 122.541,
			maxLng: 122.6032,
		});
		expect(text).toBe("10.6812–10.7245 N · 122.5410–122.6032 E");
	});

	it("uses S and W south of the equator and west of Greenwich", () => {
		const text = formatBounds({ minLat: -8.1, maxLat: -8.0, minLng: -35.2, maxLng: -35.1 });
		expect(text).toBe("8.1000–8.0000 S · 35.2000–35.1000 W");
	});
});
