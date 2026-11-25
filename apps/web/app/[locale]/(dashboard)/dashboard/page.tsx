import { BarChart, type BarChartDatum } from "@/components/analytics/bar-chart";
import { AcknowledgeButton } from "@/components/dashboard/acknowledge-button";
import { ElapsedTime } from "@/components/dashboard/elapsed-time";
import { ImpactThresholdCard } from "@/components/dashboard/impact-threshold-card";
import { DeviceStatusBadge, IncidentStatusBadge, SeverityBadge } from "@/components/domain/badges";
import { FleetMap, type FleetMapLegendItem, type FleetMapMarker } from "@/components/map/fleet-map";
import { InstallBanner } from "@/components/pwa/install-prompt";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Link } from "@/i18n/routing";
import { acknowledgeIncidentAction } from "@/lib/actions/incidents";
import { formatDuration } from "@/lib/analytics/aggregate";
import { canAdminister, canManageIncidents } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { DEVICE_OFFLINE_AFTER_MIN } from "@/lib/constants";
import { loadDashboardData } from "@/lib/dashboard/data";
import { type FleetMarkerState, fleetMarkerState } from "@/lib/dashboard/metrics";
import { LOW_BATTERY_V } from "@/lib/device/query";
import { deviceConnectionState, isGpsStale } from "@/lib/device/status";
import { metadataForPage } from "@/lib/page-metadata";
import { getOrgSettings } from "@/lib/settings/org";
import { formatDateTime, formatRelative } from "@/lib/utils";
import {
	ArrowUpRight,
	BatteryLow,
	CheckCheck,
	CheckCircle2,
	Clock,
	Download,
	Gauge,
	type LucideIcon,
	MapPin,
	Power,
	ShieldAlert,
	SlidersHorizontal,
	TriangleAlert,
	WifiOff,
	XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return metadataForPage(locale, "dashboard");
}

function incidentActivityIcon(action: string): LucideIcon {
	switch (action) {
		case "incident.acknowledged":
			return CheckCheck;
		case "incident.resolved":
			return CheckCircle2;
		case "incident.false_alarm":
		case "incident.cancelled":
			return XCircle;
		case "incident.suspected":
			return TriangleAlert;
		default:
			return ShieldAlert;
	}
}

function deviceActivityIcon(type: string): LucideIcon {
	switch (type) {
		case "POWER_LOST":
			return BatteryLow;
		case "POWER_RESTORED":
			return Power;
		case "GPS_FIX_LOST":
			return MapPin;
		case "MODEM_FAULT":
		case "DEVICE_OFFLINE":
			return WifiOff;
		case "SENSOR_FAULT":
			return Gauge;
		case "CONFIG_APPLIED":
			return SlidersHorizontal;
		case "OTA_INSTALLED":
		case "OTA_ROLLED_BACK":
			return Download;
		case "INCIDENT_CANCELLED":
			return XCircle;
		case "INCIDENT_CONFIRMED":
			return ShieldAlert;
		default:
			return TriangleAlert;
	}
}

export default async function DashboardPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ updated?: string; error?: string }>;
}) {
	const { locale } = await params;
	const { updated, error } = await searchParams;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "dashboard" });
	const v = await getTranslations({ locale, namespace: "vehicles" });
	const settings = await getTranslations({ locale, namespace: "settings" });
	const common = await getTranslations({ locale, namespace: "common" });

	const now = new Date();
	const data = await loadDashboardData(
		{ role: current.role, orgId: current.org.id, userId: current.user.id },
		now,
	);

	// Only admins get the editor, so other roles pay no extra settings read.
	const canEditThreshold = canAdminister(current.role);
	const thresholdSettings = canEditThreshold ? await getOrgSettings(current.org.id) : null;

	function incidentActivityLabel(action: string): string {
		switch (action) {
			case "incident.suspected":
				return t("activityIncidentSuspected");
			case "incident.confirmed":
				return t("activityIncidentConfirmed");
			case "incident.acknowledged":
				return t("activityIncidentAcknowledged");
			case "incident.resolved":
				return t("activityIncidentResolved");
			case "incident.false_alarm":
				return t("activityIncidentFalseAlarm");
			case "incident.cancelled":
				return t("activityIncidentCancelled");
			default:
				return t("activityUnknown");
		}
	}

	function deviceActivityLabel(type: string): string {
		switch (type) {
			case "POWER_LOST":
				return t("activityDevicePowerLost");
			case "POWER_RESTORED":
				return t("activityDevicePowerRestored");
			case "GPS_FIX_LOST":
				return t("activityDeviceGpsLost");
			case "MODEM_FAULT":
				return t("activityDeviceModemFault");
			case "SENSOR_FAULT":
				return t("activityDeviceSensorFault");
			case "CONFIG_APPLIED":
				return t("activityDeviceConfigApplied");
			case "INCIDENT_CANCELLED":
				return t("activityDeviceIncidentCancelled");
			case "INCIDENT_CONFIRMED":
				return t("activityDeviceIncidentConfirmed");
			case "OTA_INSTALLED":
				return t("activityDeviceOtaInstalled");
			case "OTA_ROLLED_BACK":
				return t("activityDeviceOtaRolledBack");
			case "SAFE_MODE_ENTERED":
				return t("activityDeviceSafeMode");
			case "DEVICE_OFFLINE":
				return t("activityDeviceOffline");
			default:
				return t("activityDeviceUnknown");
		}
	}

	const notice =
		updated === "acknowledged"
			? { tone: "success" as const, text: t("acknowledgedNotice") }
			: updated === "threshold"
				? { tone: "success" as const, text: t("thresholdSaved") }
				: error === "threshold_forbidden"
					? { tone: "error" as const, text: t("thresholdForbidden") }
					: error === "forbidden"
						? { tone: "error" as const, text: t("errorForbidden") }
						: error === "threshold"
							? { tone: "error" as const, text: t("thresholdInvalid") }
							: error === "transition"
								? { tone: "error" as const, text: t("errorTransition") }
								: error === "ack_not_dispatched"
									? { tone: "error" as const, text: t("errorAckNotDispatched") }
									: error === "command_conflict"
										? { tone: "error" as const, text: t("errorCommandConflict") }
										: error === "notfound"
											? { tone: "error" as const, text: t("errorNotFound") }
											: null;

	const stateLabels: Record<FleetMarkerState, string> = {
		incident: t("legendIncident"),
		online: t("legendOnline"),
		weak: t("legendWeak"),
		offline: t("legendOffline"),
		stale: t("legendStale"),
	};

	const markers: FleetMapMarker[] = data.map.map((vehicle) => {
		const connection = deviceConnectionState(vehicle.lastSeenAt, now);
		const staleFix = vehicle.lastFixAt == null || isGpsStale(vehicle.lastFixAt, now);
		const state = fleetMarkerState({
			connection,
			hasOpenIncident: vehicle.hasOpenIncident,
			staleFix,
		});
		const fixText = vehicle.lastFixAt ? formatRelative(vehicle.lastFixAt) : t("noFixRecorded");
		return {
			id: vehicle.deviceId,
			href: `/vehicles/${vehicle.vehicleId}`,
			plateNo: vehicle.plateNo,
			state,
			stateLabel: stateLabels[state],
			detail: `${t("lastFix")}: ${fixText}`,
			lat: vehicle.lat,
			lng: vehicle.lng,
		};
	});

	const legend: FleetMapLegendItem[] = (
		["incident", "online", "weak", "offline", "stale"] as const
	).map((state) => ({ state, label: stateLabels[state] }));

	const oldest = data.kpis.oldestAwaitingAt;
	const averageAcknowledgement = data.kpis.averageAcknowledgementMs;

	const kpis: Array<{
		key: string;
		label: string;
		value: ReactNode;
		hint: ReactNode;
		tone?: "danger" | "caution";
	}> = [
		{
			key: "open",
			label: t("kpiOpenIncidents"),
			value: data.kpis.openIncidents,
			hint: t("kpiOpenHint"),
		},
		{
			key: "awaiting",
			label: t("kpiAwaitingAck"),
			value: data.kpis.awaitingAcknowledgement,
			hint: oldest ? (
				<>
					{t("kpiOldestWait")}{" "}
					<ElapsedTime
						since={oldest.toISOString()}
						initialMs={now.getTime() - oldest.getTime()}
						title={formatDateTime(oldest, locale)}
						className="tabular-nums text-fog-300"
					/>
				</>
			) : (
				t("kpiNothingWaiting")
			),
			tone: data.kpis.awaitingAcknowledgement > 0 ? "danger" : undefined,
		},
		{
			key: "online",
			label: t("kpiOnlineTrackers"),
			value: `${data.kpis.onlineTrackers} / ${data.kpis.approvedTrackers}`,
			hint: t("kpiOnlineHint", { minutes: DEVICE_OFFLINE_AFTER_MIN }),
		},
		{
			key: "battery",
			label: t("kpiLowBattery"),
			value: data.kpis.lowBattery,
			hint: t("kpiLowBatteryHint", { volts: LOW_BATTERY_V.toFixed(1) }),
			tone: data.kpis.lowBattery > 0 ? "caution" : undefined,
		},
		{
			key: "alerts",
			label: t("kpiAlerts24h"),
			value: data.kpis.alerts24h,
			hint: t("kpiAlerts24hHint"),
		},
		{
			key: "average",
			label: t("kpiAvgAck"),
			value: formatDuration(averageAcknowledgement),
			hint: averageAcknowledgement == null ? t("kpiNoAckSamples") : t("kpiAvgAckHint"),
		},
	];

	const dayLabel = new Intl.DateTimeFormat(locale === "tl" ? "fil-PH" : "en-PH", {
		month: "short",
		day: "numeric",
		timeZone: "Asia/Manila",
	});
	const trendBars: BarChartDatum[] = data.trend.days.map((day) => {
		const label = dayLabel.format(day.date);
		return {
			key: day.key,
			label,
			value: day.count,
			description: t("incidentTrendDayAria", { day: label, count: day.count }),
		};
	});

	return (
		<>
			<InstallBanner />
			<PageHeader
				title={current.role === "USER" ? t("ownerTitle") : t("title")}
				subtitle={current.role === "USER" ? t("ownerSubtitle") : t("subtitle")}
				actions={
					<Link href="/incidents" className={buttonClasses({ size: "md" })}>
						{t("openBoard")}
						<ArrowUpRight className="size-4" aria-hidden="true" />
					</Link>
				}
			/>

			{notice ? (
				<div
					role={notice.tone === "success" ? "status" : "alert"}
					className={`mb-6 flex items-center gap-2 rounded-panel border px-3 py-2 text-body ${
						notice.tone === "success"
							? "border-clear-400/30 bg-clear-400/10 text-clear-300"
							: "border-alarm-400/30 bg-alarm-400/10 text-alarm-300"
					}`}
				>
					{notice.tone === "success" ? (
						<CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
					) : (
						<ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
					)}
					{notice.text}
				</div>
			) : null}

			<Card className="overflow-hidden">
				<div className="grid grid-cols-2 gap-px bg-ink-700 sm:grid-cols-3 xl:grid-cols-6">
					{kpis.map((kpi) => (
						<div key={kpi.key} className="min-w-0 bg-ink-800 p-3 sm:p-4">
							<p className="line-clamp-2 text-meta font-medium leading-tight text-fog-500">
								{kpi.label}
							</p>
							<p
								className={`mt-1.5 whitespace-nowrap font-display text-title leading-none tracking-tight tabular-nums ${
									kpi.tone === "danger"
										? "text-alarm-300"
										: kpi.tone === "caution"
											? "text-caution-300"
											: "text-fog-50"
								}`}
							>
								{kpi.value}
							</p>
							<p className="mt-1 hidden text-meta leading-relaxed text-fog-500 sm:block">
								{kpi.hint}
							</p>
						</div>
					))}
				</div>
				<details className="border-t border-ink-700 px-3 py-1 sm:hidden">
					<summary className="flex min-h-10 cursor-pointer items-center text-meta font-medium text-fog-300">
						{t("kpiDefinitions")}
					</summary>
					<ul className="space-y-1 pb-2 text-meta leading-snug text-fog-500">
						{kpis.map((kpi) => (
							<li key={kpi.key}>
								<span className="text-fog-300">{kpi.label}:</span> {kpi.hint}
							</li>
						))}
					</ul>
				</details>
			</Card>

			{canEditThreshold && thresholdSettings ? (
				<div className="mt-4">
					<ImpactThresholdCard
						currentG={thresholdSettings.impactThresholdG}
						locale={locale}
						labels={{
							title: t("thresholdTitle"),
							body: t("thresholdBody"),
							threshold: settings("impactThreshold"),
							hint: settings("impactThresholdHint"),
							save: common("save"),
						}}
					/>
				</div>
			) : null}

			<div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
				<Card className="flex min-w-0 flex-col">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div className="min-w-0">
							<CardTitle>{t("livePositions")}</CardTitle>
							<CardDescription>{t("livePositionsHint")}</CardDescription>
						</div>
						<Badge tone="muted" className="shrink-0">
							{t("plotted", { count: markers.length })}
						</Badge>
					</CardHeader>
					<CardContent className="flex flex-1 flex-col">
						{markers.length === 0 ? (
							<EmptyState title={t("emptyMap")} body={t("emptyMapBody")} />
						) : (
							<FleetMap markers={markers} legend={legend} ariaLabel={t("mapAria")} />
						)}
					</CardContent>
				</Card>

				<Card className="flex min-w-0 flex-col">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div className="min-w-0">
							<CardTitle>{t("needsAttention")}</CardTitle>
							<CardDescription>{t("needsAttentionHint")}</CardDescription>
						</div>
						<Badge tone={data.queueTotal > 0 ? "danger" : "success"} className="shrink-0">
							{data.queueTotal > 0 ? t("queueOpen", { count: data.queueTotal }) : t("queueClear")}
						</Badge>
					</CardHeader>
					<CardContent className="flex flex-1 flex-col">
						{data.queue.length === 0 ? (
							<EmptyState title={t("needsAttentionClear")} body={t("needsAttentionClearBody")} />
						) : (
							<ul className="divide-y divide-ink-700">
								{data.queue.map((incident) => (
									<li key={incident.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
										<div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
											<div className="min-w-0">
												<Link
													href={`/incidents/${incident.id}`}
													className="font-medium text-fog-100 hover:underline"
												>
													{incident.vehicle.plateNo}
												</Link>
												<p className="text-meta text-fog-500 sm:truncate">
													{incident.vehicle.driverName ?? t("driverUnknown")} ·{" "}
													{formatDateTime(incident.detectedAt, locale)}
												</p>
											</div>
											<div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
												<SeverityBadge
													peakAccelG={incident.peakAccelG}
													tiltDeg={incident.tiltDeg}
												/>
												<IncidentStatusBadge status={incident.status} />
											</div>
										</div>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<span className="inline-flex items-center gap-1.5 text-meta text-fog-500">
												<Clock className="size-4" aria-hidden="true" />
												{t("elapsed")}{" "}
												<ElapsedTime
													since={incident.detectedAt.toISOString()}
													initialMs={now.getTime() - incident.detectedAt.getTime()}
													title={formatDateTime(incident.detectedAt, locale)}
													className="tabular-nums text-fog-300"
												/>
											</span>
											<div className="flex items-center gap-2">
												{current.permissions["incident.acknowledge"] &&
												incident.status === "CONFIRMED" ? (
													<form action={acknowledgeIncidentAction}>
														<input type="hidden" name="locale" value={locale} />
														<input type="hidden" name="incidentId" value={incident.id} />
														<input type="hidden" name="returnTo" value="dashboard" />
														<AcknowledgeButton />
													</form>
												) : null}
												<Link
													href={`/incidents/${incident.id}`}
													className="text-meta text-fog-300 underline hover:text-fog-100"
												>
													{t("openIncident")}
												</Link>
											</div>
										</div>
									</li>
								))}
							</ul>
						)}
						{data.queueTotal > data.queue.length ? (
							<Link
								href="/incidents"
								className="mt-3 inline-flex items-center gap-1.5 text-meta text-fog-300 underline hover:text-fog-100"
							>
								{t("queueMore")}
								<ArrowUpRight className="size-4" aria-hidden="true" />
							</Link>
						) : null}
					</CardContent>
				</Card>
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-3">
				<Card className="flex min-w-0 flex-col">
					<CardHeader className="flex-row items-center justify-between gap-3">
						<div className="min-w-0">
							<CardTitle>{t("fleetStatus")}</CardTitle>
							<CardDescription>{t("fleetHint")}</CardDescription>
						</div>
						<Link
							href="/vehicles"
							className="shrink-0 text-meta text-fog-300 underline hover:text-fog-100"
						>
							{t("viewAll")}
						</Link>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{data.fleet.length === 0 ? (
							<EmptyState title={v("empty")} />
						) : (
							data.fleet.map((vehicle) => {
								const state = deviceConnectionState(vehicle.device?.lastSeenAt, now);
								const rail =
									state === "online"
										? "border-clear-400"
										: state === "weak"
											? "border-caution-400"
											: state === "offline"
												? "border-alarm-400"
												: "border-ink-600";
								return (
									<Link
										key={vehicle.id}
										href={`/vehicles/${vehicle.id}`}
										className={`flex min-w-0 items-center justify-between gap-3 rounded-control border border-l-2 border-ink-700 bg-ink-900/40 px-3 py-2.5 transition-colors hover:border-ink-600 hover:bg-ink-700/40 ${rail}`}
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-body font-medium text-fog-100">
												{vehicle.plateNo}
											</p>
											<p className="truncate text-meta text-fog-500">
												{vehicle.make} {vehicle.model}
											</p>
											<p className="truncate text-meta text-fog-500">
												{vehicle.device?.label ?? t("noTracker")}
											</p>
										</div>
										<div className="flex shrink-0 flex-col items-end gap-1">
											<DeviceStatusBadge state={state} />
											<span className="text-meta text-fog-500">
												{formatRelative(vehicle.device?.lastSeenAt)}
											</span>
										</div>
									</Link>
								);
							})
						)}
					</CardContent>
				</Card>

				<Card className="flex min-w-0 flex-col">
					<CardHeader>
						<CardTitle>{t("recentActivity")}</CardTitle>
						<CardDescription>{t("activityHint")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-1 flex-col">
						{data.activity.length === 0 ? (
							<EmptyState title={t("activityEmpty")} body={t("activityEmptyBody")} />
						) : (
							<ul className="flex flex-col gap-3">
								{data.activity.map((entry) => {
									const label =
										entry.kind === "incident"
											? incidentActivityLabel(entry.action)
											: deviceActivityLabel(entry.type);
									const Icon =
										entry.kind === "incident"
											? incidentActivityIcon(entry.action)
											: deviceActivityIcon(entry.type);
									const plate =
										entry.kind === "device" ? (entry.plateNo ?? entry.deviceLabel) : entry.plateNo;
									const href =
										entry.kind === "incident"
											? `/incidents/${entry.incidentId}`
											: entry.vehicleId
												? `/vehicles/${entry.vehicleId}`
												: null;
									const body = (
										<>
											<p className="text-body text-fog-300 group-hover:text-fog-100">
												{label}
												{plate ? <span className="text-fog-500"> · {plate}</span> : null}
											</p>
											<time
												dateTime={entry.at.toISOString()}
												title={formatDateTime(entry.at, locale)}
												className="text-meta text-fog-500"
											>
												{formatRelative(entry.at)}
											</time>
										</>
									);
									return (
										<li key={entry.key} className="flex gap-2.5">
											<Icon className="mt-0.5 size-4 shrink-0 text-fog-500" aria-hidden="true" />
											<div className="min-w-0">
												{href ? (
													<Link href={href} className="group block">
														{body}
													</Link>
												) : (
													body
												)}
											</div>
										</li>
									);
								})}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card className="flex min-w-0 flex-col">
					<CardHeader>
						<CardTitle>{t("incidentTrend")}</CardTitle>
						<CardDescription>{t("incidentTrendHint")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-1 flex-col">
						{data.trend.total === 0 ? (
							<EmptyState title={t("incidentTrendEmpty")} body={t("incidentTrendEmptyBody")} />
						) : (
							<>
								<div className="flex items-baseline justify-between gap-3">
									<p className="font-display text-title leading-none text-fog-50 tabular-nums">
										{data.trend.total}
									</p>
									<p className="text-meta text-fog-500">{t("incidentTrendTotalLabel")}</p>
								</div>
								<div className="mt-4">
									<BarChart title={t("incidentTrendAria")} data={trendBars} tickEvery={2} />
								</div>
								<div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700 pt-3 text-meta text-fog-500">
									<span>{t("trendFalseAlarms", { count: data.trend.falseAlarms })}</span>
									<span>{t("trendCancelled", { count: data.trend.cancelled })}</span>
								</div>
							</>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
