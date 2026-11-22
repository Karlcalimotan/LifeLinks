import { DeviceStatusBadge, IncidentStatusBadge } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import type { FleetVehicleView } from "@/lib/map/fleet";
import { cn, formatCoord, formatDateTime, formatRelative } from "@/lib/utils";
import { Car, TriangleAlert, X } from "lucide-react";

export interface VehiclePanelLabels {
	close: string;
	driver: string;
	tracker: string;
	connection: string;
	lastSeen: string;
	battery: string;
	signal: string;
	speed: string;
	coordinates: string;
	lastFix: string;
	satellites: string;
	lowBattery: string;
	staleFix: string;
	noPosition: string;
	noTracker: string;
	noDriver: string;
	stopped: string;
	openVehicle: string;
	openIncident: string;
}

function Detail({
	label,
	value,
	title,
	className,
}: {
	label: string;
	value: React.ReactNode;
	title?: string;
	className?: string;
}) {
	return (
		<div className={className}>
			<dt className="text-meta text-fog-500">{label}</dt>
			<dd className="mt-0.5 text-body text-fog-100 tabular-nums" title={title}>
				{value}
			</dd>
		</div>
	);
}

export function VehiclePanel({
	vehicle,
	labels,
	closeHref,
	locale,
	className,
}: {
	vehicle: FleetVehicleView;
	labels: VehiclePanelLabels;
	closeHref: string;
	locale: string;
	className?: string;
}) {
	const device = vehicle.device;

	return (
		<Card className={cn("flex min-w-0 flex-col", className)}>
			<div className="flex items-start justify-between gap-2 border-b border-ink-700 p-4 pb-3">
				<div className="min-w-0">
					<h2 className="truncate font-display text-emphasis font-semibold tracking-tight text-fog-100">
						{vehicle.plateNo}
					</h2>
					<p className="mt-0.5 truncate text-meta text-fog-500">
						{vehicle.make} {vehicle.model}
						{vehicle.year ? ` (${vehicle.year})` : ""}
					</p>
				</div>
				<Link
					href={closeHref}
					aria-label={labels.close}
					className="grid size-8 shrink-0 place-items-center rounded-control border border-ink-700 text-fog-400 transition-colors hover:border-ink-600 hover:bg-ink-700/60 hover:text-fog-50"
				>
					<X className="size-4" aria-hidden="true" />
				</Link>
			</div>

			<div className="flex flex-col gap-4 p-4 pt-3">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
					<span className="text-meta text-fog-500">{labels.connection}</span>
					<DeviceStatusBadge state={vehicle.connectionState} />
					{vehicle.lowBattery ? <Badge tone="warning">{labels.lowBattery}</Badge> : null}
					{vehicle.staleFix ? <Badge tone="warning">{labels.staleFix}</Badge> : null}
				</div>

				<dl className="grid grid-cols-2 gap-x-4 gap-y-3">
					<Detail
						label={labels.driver}
						value={
							vehicle.driverName ? (
								<>
									{vehicle.driverName}
									{vehicle.driverPhone ? (
										<span className="mt-0.5 block text-meta text-fog-500">
											{vehicle.driverPhone}
										</span>
									) : null}
								</>
							) : (
								<span className="text-fog-500">{labels.noDriver}</span>
							)
						}
					/>
					<Detail
						label={labels.tracker}
						value={
							device ? (
								<>
									{device.label}
									<span className="mt-0.5 block font-mono text-meta text-fog-500">
										{device.mac}
									</span>
								</>
							) : (
								<span className="text-fog-500">{labels.noTracker}</span>
							)
						}
					/>
					<Detail
						label={labels.lastSeen}
						value={formatRelative(device?.lastSeenAt)}
						title={formatDateTime(device?.lastSeenAt, locale)}
					/>
					<Detail
						label={labels.battery}
						value={device?.batteryV != null ? `${device.batteryV.toFixed(1)} V` : "—"}
					/>
					<Detail
						label={labels.signal}
						value={device?.rssiDbm != null ? `${device.rssiDbm} dBm` : "—"}
					/>
					<Detail
						label={labels.speed}
						value={
							device?.lastSpeedKph != null
								? device.lastSpeedKph > 0
									? `${Math.round(device.lastSpeedKph)} kph`
									: labels.stopped
								: "-"
						}
					/>
					<Detail
						label={labels.lastFix}
						value={device?.lastFixAt ? formatRelative(device.lastFixAt) : "—"}
						title={device?.lastFixAt ? formatDateTime(device.lastFixAt, locale) : undefined}
					/>
					<Detail
						label={labels.satellites}
						value={device?.satellites != null ? device.satellites : "—"}
					/>
					<Detail
						label={labels.coordinates}
						className="col-span-2"
						value={
							vehicle.position ? (
								<span className="font-mono text-meta tabular-nums text-fog-100">
									{formatCoord(vehicle.position.lat)}, {formatCoord(vehicle.position.lng)}
								</span>
							) : (
								<span className="text-fog-500">{labels.noPosition}</span>
							)
						}
					/>
				</dl>

				{vehicle.openIncident ? (
					<Link
						href={`/incidents/${vehicle.openIncident.id}`}
						className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 transition-colors hover:bg-alarm-400/15"
					>
						<span className="inline-flex items-center gap-2 text-meta font-medium text-alarm-300">
							<TriangleAlert className="size-4" aria-hidden="true" />
							{labels.openIncident}
						</span>
						<IncidentStatusBadge status={vehicle.openIncident.status} />
					</Link>
				) : null}

				<Link
					href={`/vehicles/${vehicle.id}`}
					className="inline-flex h-9 w-fit items-center gap-1.5 rounded-panel border border-ink-600 px-3 text-meta font-medium text-fog-100 transition-colors hover:bg-ink-700/60"
				>
					<Car className="size-4" aria-hidden="true" />
					{labels.openVehicle}
				</Link>
			</div>
		</Card>
	);
}
