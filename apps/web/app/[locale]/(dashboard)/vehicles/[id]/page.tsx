import {
	DeviceStatusBadge,
	IncidentStatusBadge,
	SeverityBadge,
	VehicleStatusBadge,
} from "@/components/domain/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { MaintenanceControl } from "@/components/vehicles/maintenance-control";
import { VehicleOverview } from "@/components/vehicles/vehicle-overview";
import { VehicleTabs } from "@/components/vehicles/vehicle-tabs";
import { Link } from "@/i18n/routing";
import { canAdminister, vehicleScope } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { deviceConnectionState } from "@/lib/device/status";
import { isValidCoordinate, mapLink } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { type VehicleTab, parseVehicleTab } from "@/lib/vehicles/detail";
import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

export default async function VehicleDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string; id: string }>;
	searchParams: Promise<SearchParams>;
}) {
	const { locale, id } = await params;
	const raw = await searchParams;
	const tab = parseVehicleTab(raw.tab);
	const updated = first(raw.updated) === "1";
	const error = first(raw.error);

	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "vehicles" });
	const inc = await getTranslations({ locale, namespace: "incidents" });

	const vehicle = await prisma.vehicle.findFirst({
		where: { id, ...vehicleScope(current.role, current.org.id, current.user.id) },
		// Explicit fields only: the overview needs the tracker summary, never
		// the tracker's token hash.
		select: {
			id: true,
			plateNo: true,
			make: true,
			model: true,
			driverName: true,
			driverPhone: true,
			status: true,
			devices: {
				select: {
					id: true,
					label: true,
					mac: true,
					firmwareVersion: true,
					configRev: true,
					lastSeenAt: true,
					lastLat: true,
					lastLng: true,
					lastFixAt: true,
					lastSpeedKph: true,
					batteryV: true,
					satellites: true,
					ignition: true,
				},
				orderBy: { createdAt: "asc" },
				take: 1,
			},
		},
	});
	if (!vehicle) notFound();

	const device = vehicle.devices[0] ?? null;
	const lat = device?.lastLat ?? null;
	const lng = device?.lastLng ?? null;
	const mapHref =
		lat != null && lng != null && isValidCoordinate(lat, lng) ? mapLink(lat, lng) : null;

	const trips =
		tab === "trips"
			? await prisma.trip.findMany({
					where: { orgId: current.org.id, vehicleId: vehicle.id },
					orderBy: { startedAt: "desc" },
					take: 5,
				})
			: [];
	const incidents =
		tab === "incidents"
			? await prisma.impactEvent.findMany({
					where: { orgId: current.org.id, vehicleId: vehicle.id },
					orderBy: { detectedAt: "desc" },
					take: 5,
					include: { _count: { select: { alerts: true } } },
				})
			: [];

	const tabLabels: Record<VehicleTab, string> = {
		overview: t("tabOverview"),
		trips: t("tabTrips"),
		incidents: t("tabIncidents"),
		settings: t("tabSettings"),
	};

	return (
		<>
			<PageHeader
				title={`${vehicle.plateNo} ${vehicle.make} ${vehicle.model}`}
				subtitle={vehicle.driverName ? t("driverLine", { name: vehicle.driverName }) : undefined}
				actions={
					mapHref ? (
						<a
							href={mapHref}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-8 items-center gap-1.5 rounded-panel border border-ink-600 px-3 text-meta text-fog-100 hover:border-ink-600 hover:bg-ink-700/60"
						>
							<ExternalLink className="size-4" aria-hidden="true" />
							{t("viewMap")}
						</a>
					) : undefined
				}
			/>

			{tab === "settings" && updated ? (
				<p
					aria-live="polite"
					className="mb-4 rounded-panel border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-meta text-clear-300"
				>
					{t("maintenanceUpdated")}
				</p>
			) : null}
			{tab === "settings" && error ? (
				<p
					role="alert"
					className="mb-4 rounded-panel border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300"
				>
					{error === "forbidden" ? t("maintenanceAdminOnly") : t("maintenanceError")}
				</p>
			) : null}

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<VehicleStatusBadge status={vehicle.status} />
				{device ? <DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} /> : null}
			</div>

			<VehicleTabs
				vehicleId={vehicle.id}
				active={tab}
				labels={tabLabels}
				ariaLabel={t("sections")}
			/>

			{tab === "overview" ? (
				<VehicleOverview
					locale={locale}
					driverName={vehicle.driverName}
					driverPhone={vehicle.driverPhone}
					device={device}
					linkTracker={canAdminister(current.role)}
				/>
			) : null}

			{tab === "trips" ? (
				<Card>
					<CardHeader>
						<CardTitle>{t("trips")}</CardTitle>
						<CardDescription>{t("tripsHint")}</CardDescription>
					</CardHeader>
					<CardContent>
						{trips.length === 0 ? (
							<EmptyState title={t("noTrips")} body={t("noTripsBody")} />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t("tripStarted")}</TableHead>
										<TableHead>{t("tripEnded")}</TableHead>
										<TableHead>{t("tripDistance")}</TableHead>
										<TableHead>{t("tripMaxSpeed")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{trips.map((trip) => (
										<TableRow key={trip.id}>
											<TableCell className="whitespace-nowrap">
												{formatDateTime(trip.startedAt, locale)}
											</TableCell>
											<TableCell className="whitespace-nowrap">
												{formatDateTime(trip.endedAt, locale)}
											</TableCell>
											<TableCell>
												{trip.distanceM != null ? `${(trip.distanceM / 1000).toFixed(1)} km` : "—"}
											</TableCell>
											<TableCell>
												{trip.maxSpeedKph != null ? `${Math.round(trip.maxSpeedKph)} kph` : "—"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			) : null}

			{tab === "incidents" ? (
				<Card>
					<CardHeader>
						<CardTitle>{t("recentIncidents")}</CardTitle>
						<CardDescription>{t("incidentsHint")}</CardDescription>
					</CardHeader>
					<CardContent>
						{incidents.length === 0 ? (
							<EmptyState title={inc("empty")} body={t("incidentsEmptyBody")} />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{inc("detected")}</TableHead>
										<TableHead>{inc("severity")}</TableHead>
										<TableHead>{inc("status")}</TableHead>
										<TableHead>{inc("alerts")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{incidents.map((incident) => (
										<TableRow key={incident.id}>
											<TableCell className="whitespace-nowrap">
												<Link
													href={`/incidents/${incident.id}`}
													className="font-medium text-fog-100 hover:underline"
												>
													{formatDateTime(incident.detectedAt, locale)}
												</Link>
											</TableCell>
											<TableCell>
												<SeverityBadge
													peakAccelG={incident.peakAccelG}
													tiltDeg={incident.tiltDeg}
												/>
											</TableCell>
											<TableCell>
												<IncidentStatusBadge status={incident.status} />
											</TableCell>
											<TableCell className="text-fog-500">{incident._count.alerts}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			) : null}

			{tab === "settings" ? (
				<MaintenanceControl
					locale={locale}
					vehicleId={vehicle.id}
					plateNo={vehicle.plateNo}
					status={vehicle.status}
					editable={canAdminister(current.role)}
				/>
			) : null}
		</>
	);
}
