import { DeviceStatusBadge, VehicleStatusBadge } from "@/components/domain/badges";
import { Link } from "@/i18n/routing";
import { deviceConnectionState } from "@/lib/device/status";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export interface VehicleCardItem {
	id: string;
	plateNo: string;
	make: string;
	model: string;
	year: number | null;
	status: string;
	driverName: string | null;
	driverPhone: string | null;
	devices: Array<{ label: string; mac: string; lastSeenAt: Date | null }>;
	_count: { impacts: number };
}

export async function VehicleCardList({
	locale,
	vehicles,
}: {
	locale: string;
	vehicles: readonly VehicleCardItem[];
}) {
	const t = await getTranslations({ locale, namespace: "vehicles" });
	const common = await getTranslations({ locale, namespace: "common" });

	return (
		<ul className="flex flex-col divide-y divide-ink-700/70">
			{vehicles.map((vehicle) => {
				const device = vehicle.devices[0];

				return (
					<li key={vehicle.id} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div className="min-w-0">
								<Link
									href={`/vehicles/${vehicle.id}`}
									className="break-words font-medium text-emphasis text-fog-100 hover:text-signal-300 hover:underline"
								>
									{vehicle.plateNo}
								</Link>
								<p className="mt-0.5 break-words text-meta text-fog-500">
									{vehicle.make} {vehicle.model}
									{vehicle.year ? ` (${vehicle.year})` : ""}
								</p>
							</div>
							<VehicleStatusBadge status={vehicle.status} />
						</div>

						<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-meta">
							<div className="min-w-0">
								<dt className="text-fog-500">{t("driver")}</dt>
								<dd className="mt-0.5">
									<span
										className="block truncate text-fog-100"
										title={vehicle.driverName ?? undefined}
									>
										{vehicle.driverName ?? "—"}
									</span>
									{vehicle.driverPhone ? (
										<span
											className="mt-0.5 block truncate font-mono text-meta text-fog-500"
											title={vehicle.driverPhone}
										>
											{vehicle.driverPhone}
										</span>
									) : null}
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("tracker")}</dt>
								<dd className="mt-0.5 flex flex-col items-start gap-1">
									{device ? (
										<>
											<span
												className="max-w-full min-w-0 truncate text-fog-300"
												title={device.label}
											>
												{device.label}
											</span>
											<span className="break-all font-mono text-meta text-fog-500">
												{device.mac}
											</span>
											<DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} />
										</>
									) : (
										<span className="text-fog-500">No tracker</span>
									)}
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("lastSeen")}</dt>
								<dd
									className="mt-0.5 text-fog-500"
									title={device?.lastSeenAt ? formatDateTime(device.lastSeenAt, locale) : undefined}
								>
									{formatRelative(device?.lastSeenAt)}
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">Incidents</dt>
								<dd className="mt-0.5 tabular-nums text-fog-300">{vehicle._count.impacts}</dd>
							</div>
						</dl>

						<div className="flex flex-wrap items-center gap-2">
							<Link
								href={`/vehicles/${vehicle.id}`}
								aria-label={`${common("view")}: ${vehicle.plateNo}`}
								className="inline-flex h-11 items-center gap-1 rounded-panel border border-ink-600 px-4 text-body text-fog-300 hover:bg-ink-700/60 hover:text-fog-100"
							>
								{common("view")}
								<ChevronRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
