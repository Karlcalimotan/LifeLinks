import { IncidentStatusBadge, SeverityBadge } from "@/components/domain/badges";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { acknowledgeIncidentAction } from "@/lib/actions/incidents";
import { acknowledgementDuration } from "@/lib/incidents/acknowledgement";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export interface IncidentCardItem {
	id: string;
	detectedAt: Date;
	peakAccelG: number;
	tiltDeg: number;
	status: string;
	lat: number | null;
	lng: number | null;
	vehicleId: string;
	vehicle: { plateNo: string; driverName: string | null };
	alerts: Array<{ status: string }>;
}

export async function IncidentCardList({
	locale,
	incidents,
	acknowledgedAt,
	now,
	canManage,
	returnTo,
}: {
	locale: string;
	incidents: readonly IncidentCardItem[];
	acknowledgedAt: ReadonlyMap<string, Date>;
	now: Date;
	canManage: boolean;
	returnTo: string;
}) {
	const t = await getTranslations({ locale, namespace: "incidents" });

	return (
		<ul className="flex flex-col divide-y divide-ink-700/70">
			{incidents.map((incident) => {
				const delivered = incident.alerts.filter(
					(alert) => alert.status === "SENT" || alert.status === "ACKNOWLEDGED",
				).length;
				const canAcknowledge =
					canManage && (incident.status === "CONFIRMED" || incident.status === "SUSPECTED");
				const detected = formatDateTime(incident.detectedAt, locale);

				return (
					<li key={incident.id} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div className="min-w-0">
								<p className="text-meta text-fog-500">{t("detected")}</p>
								<p className="mt-0.5 font-medium text-emphasis text-fog-100">{detected}</p>
								<p className="mt-0.5 font-mono text-meta text-fog-500">
									{incident.id} · {formatRelative(incident.detectedAt)}
								</p>
							</div>
							<div className="flex flex-wrap gap-1.5">
								<SeverityBadge peakAccelG={incident.peakAccelG} tiltDeg={incident.tiltDeg} />
								<IncidentStatusBadge status={incident.status} />
							</div>
						</div>

						<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-meta">
							<div className="min-w-0">
								<dt className="text-fog-500">{t("vehicle")}</dt>
								<dd className="mt-0.5">
									<Link
										href={`/vehicles/${incident.vehicleId}`}
										className="font-medium text-fog-100 hover:text-signal-300 hover:underline"
									>
										{incident.vehicle.plateNo}
									</Link>
									<span className="mt-0.5 block truncate text-fog-500">
										{incident.vehicle.driverName ?? "—"}
									</span>
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("location")}</dt>
								<dd className="mt-0.5 whitespace-nowrap font-mono text-fog-300">
									{incident.lat != null && incident.lng != null
										? `${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)}`
										: "—"}
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("alertDelivery")}</dt>
								<dd className="mt-0.5 tabular-nums text-fog-300">
									{incident.alerts.length === 0 ? "—" : `${delivered} / ${incident.alerts.length}`}
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("timeToAcknowledge")}</dt>
								<dd className="mt-0.5 font-mono text-fog-300">
									{acknowledgementDuration({
										status: incident.status,
										detectedAt: incident.detectedAt,
										acknowledgedAt: acknowledgedAt.get(incident.id) ?? null,
										now,
									})}
								</dd>
							</div>
						</dl>

						<div className="flex flex-wrap items-center gap-2">
							{canAcknowledge ? (
								<form action={acknowledgeIncidentAction}>
									<input type="hidden" name="locale" value={locale} />
									<input type="hidden" name="incidentId" value={incident.id} />
									<input type="hidden" name="returnTo" value={returnTo} />
									<Button type="submit" size="lg" variant="secondary">
										{t("acknowledge")}
									</Button>
								</form>
							) : null}
							<Link
								href={`/incidents/${incident.id}`}
								aria-label={t("openIncident", { time: detected })}
								className="inline-flex h-11 items-center gap-1 rounded-panel border border-ink-600 px-4 text-body text-fog-300 hover:bg-ink-700/60 hover:text-fog-100"
							>
								{t("open")}
								<ChevronRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
