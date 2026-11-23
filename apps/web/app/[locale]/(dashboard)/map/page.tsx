import { FleetLegend } from "@/components/map/fleet-legend";
import { MapEscape } from "@/components/map/map-escape";
import { MapToolbar } from "@/components/map/map-toolbar";
import { MarkerGlyph, markerBadgeTone } from "@/components/map/marker-glyph";
import { SchematicMap } from "@/components/map/schematic-map";
import { VehiclePanel } from "@/components/map/vehicle-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Link } from "@/i18n/routing";
import { vehicleScope } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { GPS_STALE_AFTER_S } from "@/lib/constants";
import {
	type MarkerState,
	OPEN_INCIDENT_STATUSES,
	buildFleetVehicles,
	filterFleetVehicles,
	vehiclesWithPosition,
} from "@/lib/map/fleet";
import { buildMapHref, hasActiveMapFilters, parseMapQuery } from "@/lib/map/query";
import { metadataForPage } from "@/lib/page-metadata";
import prisma from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { MAP_VEHICLE_SELECT } from "@/lib/vehicles/payload";
import { Maximize2, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return metadataForPage(locale, "map");
}

export default async function MapPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { locale } = await params;
	const query = parseMapQuery(await searchParams);
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "map" });

	const now = new Date();
	const scope = vehicleScope(current.role, current.org.id, current.user.id);

	const [vehicles, openIncidents] = await Promise.all([
		prisma.vehicle.findMany({
			where: scope,
			orderBy: { plateNo: "asc" },
			select: MAP_VEHICLE_SELECT,
		}),
		prisma.impactEvent.findMany({
			where: {
				orgId: current.org.id,
				status: { in: [...OPEN_INCIDENT_STATUSES] },
				...(current.role === "USER" ? { vehicle: { ownerId: current.user.id } } : {}),
			},
			orderBy: { detectedAt: "desc" },
			select: { id: true, vehicleId: true, status: true, detectedAt: true },
		}),
	]);

	const fleet = buildFleetVehicles(
		vehicles.map((vehicle) => {
			const device = vehicle.devices.find((item) => item.approvalStatus === "APPROVED") ?? null;

			return {
				id: vehicle.id,
				plateNo: vehicle.plateNo,
				make: vehicle.make,
				model: vehicle.model,
				year: vehicle.year,
				driverName: vehicle.driverName,
				driverPhone: vehicle.driverPhone,
				device: device
					? {
							id: device.id,
							label: device.label,
							mac: device.mac,
							lastSeenAt: device.lastSeenAt,
							lastLat: device.lastLat,
							lastLng: device.lastLng,
							lastFixAt: device.lastFixAt,
							lastSpeedKph: device.lastSpeedKph,
							batteryV: device.batteryV,
							rssiDbm: device.rssiDbm,
							satellites: device.satellites,
						}
					: null,
			};
		}),
		openIncidents,
		now,
	);

	const filtered = filterFleetVehicles(fleet, query);
	const positions = vehiclesWithPosition(filtered);
	const selected = query.vehicle
		? (fleet.find((vehicle) => vehicle.id === query.vehicle) ?? null)
		: null;
	const fitAllHref = buildMapHref(query, { vehicle: null });
	const clearFiltersHref = buildMapHref(query, { q: "", filter: "all", vehicle: null });
	const hasFilters = hasActiveMapFilters(query);

	const stateLabels: Record<MarkerState, string> = {
		online: t("states.online"),
		weak: t("states.weak"),
		"low-battery": t("states.lowBattery"),
		offline: t("states.offline"),
		"never-seen": t("states.neverSeen"),
		incident: t("states.incident"),
	};

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			<div
				className={
					selected
						? "grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,248px)_minmax(0,1fr)_minmax(0,300px)]"
						: "grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]"
				}
			>
				<Card className="order-1 flex min-w-0 flex-col overflow-hidden">
					<div className="flex flex-col gap-3 border-b border-ink-700 p-4">
						<div className="flex items-baseline justify-between gap-2">
							<h2 className="font-display text-emphasis font-semibold tracking-tight text-fog-100">
								{t("vehicles")}
							</h2>
							<span className="text-meta tabular-nums text-fog-500">
								{t("listCount", { shown: filtered.length, total: fleet.length })}
							</span>
						</div>
						<MapToolbar
							query={query}
							labels={{
								searchLabel: t("searchLabel"),
								searchPlaceholder: t("searchPlaceholder"),
								searchSubmit: t("searchSubmit"),
								filterLabel: t("filterLabel"),
								filters: {
									all: t("filters.all"),
									online: t("filters.online"),
									offline: t("filters.offline"),
									"low-battery": t("filters.lowBattery"),
									incident: t("filters.incident"),
								},
							}}
						/>
					</div>

					{filtered.length === 0 ? (
						<div className="p-4">
							<EmptyState
								title={hasFilters ? t("empty.noMatchesTitle") : t("empty.noVehiclesTitle")}
								body={hasFilters ? t("empty.noMatchesBody") : t("empty.noVehiclesBody")}
							/>
							{hasFilters ? (
								<div className="mt-3 text-center">
									<Link
										href={clearFiltersHref}
										className="text-meta text-fog-300 underline underline-offset-2 hover:text-fog-100"
									>
										{t("empty.clearFilters")}
									</Link>
								</div>
							) : null}
						</div>
					) : (
						<div className="max-h-96 divide-y divide-ink-700/70 overflow-y-auto">
							{filtered.map((vehicle) => {
								const isSelected = selected?.id === vehicle.id;
								return (
									<Link
										key={vehicle.id}
										href={buildMapHref(query, { vehicle: vehicle.id })}
										aria-current={isSelected ? "true" : undefined}
										className={[
											"flex items-start gap-2.5 border-l-2 px-3 py-2.5 transition-colors",
											isSelected
												? "border-fog-300/70 bg-ink-700/60"
												: "border-transparent hover:border-ink-600 hover:bg-ink-700/40",
										].join(" ")}
									>
										<MarkerGlyph
											state={vehicle.markerState}
											stale={vehicle.staleFix}
											selected={isSelected}
											className="mt-1"
										/>
										<span className="min-w-0 flex-1">
											<span className="flex items-center gap-1.5">
												<span className="truncate text-body font-medium text-fog-100">
													{vehicle.plateNo}
												</span>
												{vehicle.openIncident ? (
													<TriangleAlert
														className="size-3.5 shrink-0 text-alarm-300"
														aria-hidden="true"
													/>
												) : null}
											</span>
											<span className="mt-0.5 block truncate text-meta text-fog-500">
												{vehicle.make} {vehicle.model}
											</span>
											<span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
												<Badge tone={markerBadgeTone(vehicle.markerState)}>
													{stateLabels[vehicle.markerState]}
												</Badge>
												{vehicle.device ? (
													<span
														className="text-meta text-fog-500"
														title={formatDateTime(vehicle.device.lastSeenAt, locale)}
													>
														{formatRelative(vehicle.device.lastSeenAt)}
													</span>
												) : null}
												{vehicle.lowBattery && vehicle.markerState !== "low-battery" ? (
													<span className="text-meta text-caution-300">
														{t("panel.lowBattery")}
													</span>
												) : null}
											</span>
										</span>
									</Link>
								);
							})}
						</div>
					)}
				</Card>

				<Card className="order-2 flex min-w-0 flex-col overflow-hidden">
					<div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-700 p-4">
						<div className="min-w-0">
							<h2 className="font-display text-emphasis font-semibold tracking-tight text-fog-100">
								{t("mapTitle")}
							</h2>
							<p className="mt-0.5 text-meta text-fog-500">
								{t("positionsSummary", {
									positions: positions.length,
									total: filtered.length,
								})}
							</p>
						</div>
						<Link
							href={fitAllHref}
							className="inline-flex h-8 items-center gap-1.5 rounded-panel border border-ink-600 px-3 text-meta font-medium text-fog-100 transition-colors hover:bg-ink-700/60"
						>
							<Maximize2 className="size-3.5" aria-hidden="true" />
							{t("fitAll")}
						</Link>
					</div>

					{positions.length === 0 ? (
						<div className="p-5">
							<EmptyState title={t("empty.noPositionsTitle")} body={t("empty.noPositionsBody")} />
						</div>
					) : (
						<SchematicMap
							markers={positions.map((vehicle) => ({
								id: vehicle.id,
								plate: vehicle.plateNo,
								lat: vehicle.position.lat,
								lng: vehicle.position.lng,
								state: vehicle.markerState,
								stale: vehicle.staleFix,
								selected: selected?.id === vehicle.id,
								href: buildMapHref(query, { vehicle: vehicle.id }),
							}))}
							stateLabels={stateLabels}
							staleLabel={t("panel.staleFix")}
							mapLabel={t("mapLabel", { count: positions.length })}
							schematicNote={t("schematicNote")}
						/>
					)}

					<FleetLegend
						labels={{
							title: t("legendTitle"),
							states: stateLabels,
							stale: t("legendStale", { minutes: GPS_STALE_AFTER_S / 60 }),
						}}
					/>
				</Card>

				{selected ? (
					<>
						<VehiclePanel
							vehicle={selected}
							locale={locale}
							closeHref={buildMapHref(query, { vehicle: null })}
							className="order-3 lg:col-span-2 xl:col-span-1"
							labels={{
								close: t("panel.close"),
								driver: t("panel.driver"),
								tracker: t("panel.tracker"),
								connection: t("panel.connection"),
								lastSeen: t("panel.lastSeen"),
								battery: t("panel.battery"),
								signal: t("panel.signal"),
								speed: t("panel.speed"),
								coordinates: t("panel.coordinates"),
								lastFix: t("panel.lastFix"),
								satellites: t("panel.satellites"),
								lowBattery: t("panel.lowBattery"),
								staleFix: t("panel.staleFix"),
								noPosition: t("panel.noPosition"),
								noTracker: t("panel.noTracker"),
								noDriver: t("panel.noDriver"),
								stopped: t("panel.stopped"),
								openVehicle: t("panel.openVehicle"),
								openIncident: t("panel.openIncident"),
							}}
						/>
						<MapEscape href={buildMapHref(query, { vehicle: null })} />
					</>
				) : null}
			</div>
		</>
	);
}
