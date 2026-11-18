import {
	DeviceStatusBadge,
	IncidentStatusBadge,
	SeverityBadge,
	VehicleStatusBadge,
} from "@/components/domain/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/routing";
import { canAdminister, vehicleScope } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { deviceConnectionState, gpsAgeSeconds } from "@/lib/device/status";
import { isValidCoordinate, mapLink } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { formatCoord, formatDateTime, formatRelative } from "@/lib/utils";
import { ExternalLink, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function VehicleDetailPage({
	params,
}: {
	params: Promise<{ locale: string; id: string }>;
}) {
	const { locale, id } = await params;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "vehicles" });
	const inc = await getTranslations({ locale, namespace: "incidents" });

	const vehicle = await prisma.vehicle.findFirst({
		where: { id, ...vehicleScope(current.role, current.org.id, current.user.id) },
		include: {
			devices: true,
			trips: { orderBy: { startedAt: "desc" }, take: 5 },
			impacts: {
				orderBy: { detectedAt: "desc" },
				take: 5,
				include: { alerts: true },
			},
		},
	});
	if (!vehicle) notFound();

	const device = vehicle.devices[0];
	const state = deviceConnectionState(device?.lastSeenAt);
	const hasFix =
		device?.lastLat != null &&
		device?.lastLng != null &&
		isValidCoordinate(device.lastLat, device.lastLng);

	return (
		<>
			<PageHeader
				title={`${vehicle.plateNo} ${vehicle.make} ${vehicle.model}`}
				subtitle={vehicle.driverName ? `${t("driver")}: ${vehicle.driverName}` : undefined}
				actions={
					hasFix ? (
						<a
							href={mapLink(device.lastLat as number, device.lastLng as number)}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-8 items-center gap-1.5 rounded border border-ink-600 px-3 text-xs text-fog-300 hover:border-ink-600 hover:text-fog-50"
						>
							<ExternalLink className="size-3.5" />
							{t("viewMap")}
						</a>
					) : null
				}
			/>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<VehicleStatusBadge status={vehicle.status} />
				{device ? <DeviceStatusBadge state={state} /> : null}
			</div>

			<div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("location")}</CardTitle>
					</CardHeader>
					<CardContent>
						{hasFix ? (
							<div className="flex items-start gap-3">
								<span className="mt-0.5 grid size-9 place-items-center rounded border border-rescue-500/30 bg-rescue-500/10 text-rescue-300">
									<MapPin className="size-4" />
								</span>
								<div>
									<p className="text-sm text-fog-100">
										{formatCoord(device.lastLat)}, {formatCoord(device.lastLng)}
									</p>
									<p className="mt-1 text-[11px] text-fog-500">
										GPS age {gpsAgeSeconds(device.lastFixAt) ?? "unknown"}s / {t("lastSeen")}{" "}
										{formatRelative(device.lastSeenAt)}
									</p>
								</div>
							</div>
						) : (
							<EmptyState
								title="No GPS fix yet"
								body="The tracker has not reported a valid position."
							/>
						)}

						<div className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-[11px] font-medium text-fog-500">{t("speed")}</p>
								<p className="mt-1 text-sm text-fog-100">
									{device?.lastSpeedKph != null ? `${Math.round(device.lastSpeedKph)} kph` : "—"}
								</p>
							</div>
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-[11px] font-medium text-fog-500">{t("battery")}</p>
								<p className="mt-1 text-sm text-fog-100">
									{device?.batteryV != null ? `${device.batteryV.toFixed(1)} V` : "—"}
								</p>
							</div>
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-[11px] font-medium text-fog-500">Satellites</p>
								<p className="mt-1 text-sm text-fog-100">{device?.satellites ?? "—"}</p>
							</div>
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-[11px] font-medium text-fog-500">{t("ignition")}</p>
								<p className="mt-1 text-sm text-fog-100">
									{device?.ignition == null ? "—" : device.ignition ? "On" : "Off"}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("device")}</CardTitle>
					</CardHeader>
					<CardContent>
						{device ? (
							<div className="flex flex-col gap-2 text-sm">
								{canAdminister(current.role) ? (
									<Link
										href={`/devices/${device.id}`}
										className="text-signal-400 hover:text-signal-300"
									>
										{device.label}
									</Link>
								) : (
									<span className="text-fog-100">{device.label}</span>
								)}
								<p className="text-xs text-fog-500">MAC {device.mac}</p>
								<p className="text-xs text-fog-500">
									Firmware {device.firmwareVersion ?? "unknown"} / config rev{" "}
									{device.configRev ?? "—"}
								</p>
								<p className="text-xs text-fog-500">
									Last seen {formatDateTime(device.lastSeenAt, locale)}
								</p>
							</div>
						) : (
							<EmptyState title="No tracker assigned" />
						)}
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>{t("trips")}</CardTitle>
					</CardHeader>
					<CardContent>
						{vehicle.trips.length === 0 ? (
							<EmptyState title={t("noTrips")} />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Started</TableHead>
										<TableHead>Ended</TableHead>
										<TableHead>Distance</TableHead>
										<TableHead>Max speed</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{vehicle.trips.map((trip) => (
										<TableRow key={trip.id}>
											<TableCell>{formatDateTime(trip.startedAt, locale)}</TableCell>
											<TableCell>{formatDateTime(trip.endedAt, locale)}</TableCell>
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

				<Card>
					<CardHeader>
						<CardTitle>{t("recentIncidents")}</CardTitle>
					</CardHeader>
					<CardContent>
						{vehicle.impacts.length === 0 ? (
							<EmptyState title={inc("empty")} />
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
									{vehicle.impacts.map((incident) => (
										<TableRow key={incident.id}>
											<TableCell>
												<Link
													href={`/incidents/${incident.id}`}
													className="text-signal-400 hover:text-signal-300"
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
											<TableCell className="text-xs text-fog-500">
												{incident.alerts.length}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
