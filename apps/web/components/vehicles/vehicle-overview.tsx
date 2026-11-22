import { DeviceStatusBadge } from "@/components/domain/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-header";
import { Link } from "@/i18n/routing";
import { deviceConnectionState, gpsAgeSeconds } from "@/lib/device/status";
import { isValidCoordinate } from "@/lib/geo";
import { formatCoord, formatDateTime, formatRelative } from "@/lib/utils";
import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";

export interface VehicleTrackerSummary {
	id: string;
	label: string;
	mac: string;
	firmwareVersion: string | null;
	configRev: number | null;
	lastSeenAt: Date | null;
	lastLat: number | null;
	lastLng: number | null;
	lastFixAt: Date | null;
	lastSpeedKph: number | null;
	batteryV: number | null;
	satellites: number | null;
	ignition: boolean | null;
}

export async function VehicleOverview({
	locale,
	driverName,
	driverPhone,
	device,
	linkTracker,
}: {
	locale: string;
	driverName: string | null;
	driverPhone: string | null;
	device: VehicleTrackerSummary | null;
	linkTracker: boolean;
}) {
	const t = await getTranslations({ locale, namespace: "vehicles" });

	const hasFix =
		device?.lastLat != null &&
		device?.lastLng != null &&
		isValidCoordinate(device.lastLat, device.lastLng);
	const fixAge = gpsAgeSeconds(device?.lastFixAt);
	const speed = device?.lastSpeedKph != null ? `${Math.round(device.lastSpeedKph)} kph` : "—";
	const battery = device?.batteryV != null ? `${device.batteryV.toFixed(1)} V` : "—";
	const ignition =
		device?.ignition == null ? "—" : device.ignition ? t("ignitionOn") : t("ignitionOff");

	return (
		<div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>{t("positionTitle")}</CardTitle>
				</CardHeader>
				<CardContent>
					{device && hasFix ? (
						<div className="flex items-start gap-3">
							<span className="grid size-8 shrink-0 place-items-center rounded-control border border-rescue-400/30 bg-rescue-400/10 text-rescue-300">
								<MapPin className="size-4" aria-hidden="true" />
							</span>
							<div className="min-w-0">
								<p className="font-mono text-body text-fog-100 tabular-nums">
									{formatCoord(device.lastLat)}, {formatCoord(device.lastLng)}
								</p>
								<p className="mt-1 text-meta text-fog-500">
									{t("fixAge")}: {fixAge == null ? "—" : t("ageValue", { seconds: fixAge })} ·{" "}
									{t("lastSeen")}{" "}
									<time
										dateTime={device.lastSeenAt?.toISOString()}
										title={formatDateTime(device.lastSeenAt, locale)}
									>
										{formatRelative(device.lastSeenAt)}
									</time>
								</p>
							</div>
						</div>
					) : (
						<EmptyState title={t("noFixTitle")} body={t("noFixBody")} />
					)}

					{device ? (
						<dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink-700 pt-4 sm:grid-cols-4">
							<div>
								<dt className="text-meta text-fog-500">{t("speed")}</dt>
								<dd className="mt-1 text-emphasis text-fog-100 tabular-nums">{speed}</dd>
							</div>
							<div>
								<dt className="text-meta text-fog-500">{t("battery")}</dt>
								<dd className="mt-1 text-emphasis text-fog-100 tabular-nums">{battery}</dd>
							</div>
							<div>
								<dt className="text-meta text-fog-500">{t("satellites")}</dt>
								<dd className="mt-1 text-emphasis text-fog-100 tabular-nums">
									{device.satellites ?? "—"}
								</dd>
							</div>
							<div>
								<dt className="text-meta text-fog-500">{t("ignition")}</dt>
								<dd className="mt-1 text-emphasis text-fog-100">{ignition}</dd>
							</div>
						</dl>
					) : null}
				</CardContent>
			</Card>

			<div className="flex min-w-0 flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>{t("device")}</CardTitle>
					</CardHeader>
					<CardContent>
						{device ? (
							<div className="flex flex-col gap-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									{linkTracker ? (
										<Link
											href={`/devices/${device.id}`}
											className="text-body font-medium text-fog-100 hover:underline"
										>
											{device.label}
										</Link>
									) : (
										<span className="text-body font-medium text-fog-100">{device.label}</span>
									)}
									<DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} />
								</div>
								<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-meta">
									<dt className="text-fog-500">{t("trackerMac")}</dt>
									<dd className="font-mono text-fog-100">{device.mac}</dd>
									<dt className="text-fog-500">{t("firmware")}</dt>
									<dd className="text-fog-100">{device.firmwareVersion ?? "—"}</dd>
									<dt className="text-fog-500">{t("configRevision")}</dt>
									<dd className="text-fog-100 tabular-nums">{device.configRev ?? "—"}</dd>
									<dt className="text-fog-500">{t("lastSeen")}</dt>
									<dd className="text-fog-100">
										<time
											dateTime={device.lastSeenAt?.toISOString()}
											title={formatDateTime(device.lastSeenAt, locale)}
										>
											{formatRelative(device.lastSeenAt)}
										</time>
									</dd>
								</dl>
							</div>
						) : (
							<EmptyState title={t("noTrackerTitle")} body={t("noTrackerBody")} />
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("driver")}</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-body">
							<dt className="text-fog-500">{t("driverName")}</dt>
							<dd className="text-fog-100">{driverName ?? t("driverNotRecorded")}</dd>
							<dt className="text-fog-500">{t("driverPhone")}</dt>
							<dd className="font-mono text-fog-100">{driverPhone ?? "—"}</dd>
						</dl>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
