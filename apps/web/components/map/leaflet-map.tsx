"use client";

import { useRouter } from "@/i18n/routing";
import type { MarkerState } from "@/lib/map/fleet";
import type * as Leaflet from "leaflet";
import { useEffect, useRef } from "react";

export interface LeafletMapMarker {
	id: string;
	plate: string;
	lat: number;
	lng: number;
	state: MarkerState;
	stale: boolean;
	selected: boolean;
	href: string;
}

const MARKER_COLOR: Record<MarkerState, string> = {
	online: "--color-clear-400",
	weak: "--color-caution-400",
	"low-battery": "--color-caution-400",
	offline: "--color-alarm-400",
	"never-seen": "--color-fog-500",
	incident: "--color-alarm-500",
};

function readColor(token: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

/**
 * Real OpenStreetMap tiles with the same marker states as the schematic. The
 * vehicle list beside the map remains the keyboard-accessible selector; the
 * map is the spatial view.
 */
export function LeafletMap({
	markers,
	stateLabels,
	mapLabel,
}: {
	markers: LeafletMapMarker[];
	stateLabels: Record<MarkerState, string>;
	mapLabel: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<Leaflet.Map | null>(null);
	const router = useRouter();

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const L = (await import("leaflet")).default;
			if (cancelled || !containerRef.current) return;

			if (!mapRef.current) {
				mapRef.current = L.map(containerRef.current, {
					zoomControl: true,
					scrollWheelZoom: true,
					worldCopyJump: true,
				});

				L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					maxZoom: 19,
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				}).addTo(mapRef.current);
			}

			const map = mapRef.current;
			map.eachLayer((layer) => {
				if (layer instanceof L.TileLayer) return;
				map.removeLayer(layer);
			});

			const colors = {
				online: readColor(MARKER_COLOR.online),
				weak: readColor(MARKER_COLOR.weak),
				"low-battery": readColor(MARKER_COLOR["low-battery"]),
				offline: readColor(MARKER_COLOR.offline),
				"never-seen": readColor(MARKER_COLOR["never-seen"]),
				incident: readColor(MARKER_COLOR.incident),
			};

			if (markers.length === 0) {
				map.setView([10.3157, 123.8854], 11);
				return;
			}

			const bounds = L.latLngBounds(markers.map((marker) => [marker.lat, marker.lng]));
			for (const marker of markers) {
				const color = colors[marker.state];
				const circle = L.circleMarker([marker.lat, marker.lng], {
					radius: marker.selected ? 10 : 7,
					color,
					weight: marker.selected ? 3 : 2,
					fillColor: color,
					fillOpacity: marker.state === "offline" || marker.state === "never-seen" ? 0.35 : 0.9,
				});

				circle.bindTooltip(`${marker.plate} · ${stateLabels[marker.state]}`, {
					direction: "top",
					offset: [0, -6],
				});
				circle.on("click", () => router.push(marker.href));
				circle.addTo(map);
				if (marker.selected) circle.openTooltip();
			}

			map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
			requestAnimationFrame(() => map.invalidateSize());
		})();

		return () => {
			cancelled = true;
		};
	}, [markers, router, stateLabels]);

	useEffect(
		() => () => {
			mapRef.current?.remove();
			mapRef.current = null;
		},
		[],
	);

	return <div ref={containerRef} aria-label={mapLabel} className="h-[320px] w-full sm:h-[420px]" />;
}
