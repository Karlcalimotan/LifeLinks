import { DeviceStatusBadge, IncidentStatusBadge, SeverityBadge } from "@/components/domain/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/routing";
import { vehicleScope } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { DEVICE_OFFLINE_AFTER_MIN } from "@/lib/constants";
import { deviceConnectionState } from "@/lib/device/status";
import prisma from "@/lib/prisma";
import { getOrgSettings } from "@/lib/settings/org";
import { minutesAgo } from "@/lib/time";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ArrowUpRight, Car, Radio, ShieldAlert, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "dashboard" });
	const v = await getTranslations({ locale, namespace: "vehicles" });
	const inc = await getTranslations({ locale, namespace: "incidents" });

	const now = new Date();
	const onlineCutoff = minutesAgo(DEVICE_OFFLINE_AFTER_MIN, now);
	const scope = vehicleScope(current.role, current.org.id, current.user.id);
	const ownedRelation =
		current.role === "USER" ? { vehicle: { is: { ownerId: current.user.id } } } : {};
	const incidentWhere = { orgId: current.org.id, ...ownedRelation };
	const today = new Date(
		`${new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Manila",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(now)}T00:00:00+08:00`,
	);

	const [
		vehicleCount,
		onlineCount,
		openIncidents,
		alertsToday,
		resolvedToday,
		recentIncidents,
		vehicles,
		settings,
	] = await Promise.all([
		prisma.vehicle.count({ where: scope }),
		prisma.trackerDevice.count({
			where: { orgId: current.org.id, ...ownedRelation, lastSeenAt: { gte: onlineCutoff } },
		}),
		prisma.impactEvent.count({
			where: {
				...incidentWhere,
				status: { in: ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED"] },
			},
		}),
		prisma.impactEvent.count({
			where: { ...incidentWhere, detectedAt: { gte: today } },
		}),
		prisma.impactEvent.count({
			where: { ...incidentWhere, status: "RESOLVED", resolvedAt: { gte: today } },
		}),
		prisma.impactEvent.findMany({
			where: incidentWhere,
			orderBy: { detectedAt: "desc" },
			take: 5,
			include: { vehicle: true, alerts: true },
		}),
		prisma.vehicle.findMany({
			where: scope,
			orderBy: { plateNo: "asc" },
			take: 8,
			include: { devices: true },
		}),
		getOrgSettings(current.org.id),
	]);

	const openTone = openIncidents > 0 ? "bg-alarm-500" : "bg-clear-400";

	return (
		<>
			<PageHeader
				title={current.role === "USER" ? t("ownerTitle") : t("title")}
				subtitle={current.role === "USER" ? t("ownerSubtitle") : t("subtitle")}
			/>

			<div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
				<Card className="cut-corner relative flex flex-col overflow-hidden border-ink-700 bg-ink-800">
					<span className={`absolute inset-y-0 left-0 w-1 ${openTone}`} aria-hidden="true" />
					<div
						className="pointer-events-none absolute inset-y-0 right-0 w-1/3 console-grid opacity-50"
						style={{ maskImage: "linear-gradient(to left, black, transparent)" }}
					/>
					<div className="relative flex flex-1 flex-col p-6">
						<div className="flex items-center gap-2 text-[11px] font-medium text-fog-500">
							<span className={`size-1.5 ${openTone}`} aria-hidden="true" />
							{t("liveBoard")}
						</div>
						<div className="mt-3">
							<p className="text-sm font-medium text-fog-100">
								{openIncidents > 0 ? t("attention") : t("allClear")}
							</p>
							<p className="mt-1 font-display text-7xl leading-none tracking-tight text-fog-50 tabular-nums">
								{openIncidents}
							</p>
							<p className="mt-2 max-w-md text-xs leading-relaxed text-fog-500">
								{t("incidentBoardHint")}
							</p>
						</div>
						<div className="mt-6">
							<Link
								href="/incidents"
								className="inline-flex h-9 items-center gap-2 rounded bg-signal-500 px-4 text-sm font-medium text-ink-950 transition-colors hover:bg-signal-400"
							>
								{t("openBoard")}
								<ArrowUpRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
						<div className="mt-auto grid grid-cols-2 gap-4 border-t border-ink-700 pt-4">
							<div>
								<p className="font-display text-2xl leading-none text-fog-50 tabular-nums">
									{settings.cancelWindowS}s
								</p>
								<p className="mt-1 text-[11px] text-fog-500">{t("cancelWindow")}</p>
							</div>
							<div>
								<p className="font-display text-2xl leading-none text-fog-50 tabular-nums">
									{settings.sosRetryS}s
								</p>
								<p className="mt-1 text-[11px] text-fog-500">{t("sosRetry")}</p>
							</div>
						</div>
					</div>
				</Card>

				<div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
					<StatCard label={t("totalVehicles")} value={vehicleCount} icon={Car} />
					<StatCard
						label={t("onlineTrackers")}
						value={onlineCount}
						icon={Radio}
						tone={onlineCount > 0 ? "success" : "default"}
						hint={`${DEVICE_OFFLINE_AFTER_MIN} min window`}
					/>
					<StatCard
						label={t("alertsToday")}
						value={alertsToday}
						icon={ShieldAlert}
						tone={alertsToday > 0 ? "danger" : "default"}
						hint="Asia/Manila"
					/>
				</div>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
				<Card className="flex flex-col">
					<CardHeader className="flex-row items-center justify-between gap-3">
						<CardTitle>{t("recentIncidents")}</CardTitle>
						<Link
							href="/incidents"
							className="text-xs font-medium text-signal-400 hover:text-signal-300"
						>
							{t("viewAll")}
						</Link>
					</CardHeader>
					<CardContent className="flex flex-1 flex-col">
						{recentIncidents.length === 0 ? (
							<EmptyState title={t("noIncidents")} />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{inc("detected")}</TableHead>
										<TableHead>{inc("vehicle")}</TableHead>
										<TableHead className="hidden sm:table-cell">{inc("severity")}</TableHead>
										<TableHead>{inc("status")}</TableHead>
										<TableHead className="hidden md:table-cell">{inc("alerts")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{recentIncidents.map((incident) => (
										<TableRow key={incident.id}>
											<TableCell className="whitespace-nowrap">
												<Link
													href={`/incidents/${incident.id}`}
													className="font-medium text-signal-400 hover:text-signal-300"
												>
													{formatDateTime(incident.detectedAt, locale)}
												</Link>
											</TableCell>
											<TableCell className="whitespace-nowrap text-fog-100">
												{incident.vehicle.plateNo}
											</TableCell>
											<TableCell className="hidden sm:table-cell">
												<SeverityBadge
													peakAccelG={incident.peakAccelG}
													tiltDeg={incident.tiltDeg}
												/>
											</TableCell>
											<TableCell className="whitespace-nowrap">
												<IncidentStatusBadge status={incident.status} />
											</TableCell>
											<TableCell className="hidden text-xs text-fog-500 md:table-cell">
												{incident.alerts.length}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
						<div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-700 pt-4 xl:mt-auto">
							<div>
								<p className="font-display text-xl leading-none text-fog-50 tabular-nums">
									{openIncidents}
								</p>
								<p className="mt-1 text-[11px] text-fog-500">{t("open")}</p>
							</div>
							<div>
								<p className="font-display text-xl leading-none text-fog-50 tabular-nums">
									{resolvedToday}
								</p>
								<p className="mt-1 text-[11px] text-fog-500">{t("resolvedToday")}</p>
							</div>
							<div>
								<p className="font-display text-xl leading-none text-fog-50 tabular-nums">
									{alertsToday}
								</p>
								<p className="mt-1 text-[11px] text-fog-500">{t("alertsToday")}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("fleetStatus")}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{vehicles.length === 0 ? (
							<EmptyState title={v("empty")} />
						) : (
							vehicles.map((vehicle) => {
								const device = vehicle.devices[0];
								const state = deviceConnectionState(device?.lastSeenAt, now);
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
										className={`flex items-center justify-between gap-3 rounded-[3px] border border-l-2 border-ink-700 bg-ink-900/40 px-3 py-2.5 transition-colors hover:border-ink-600 hover:bg-ink-700/40 ${rail}`}
									>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-fog-100">{vehicle.plateNo}</p>
											<p className="truncate text-[11px] text-fog-500">
												{vehicle.make} {vehicle.model}
											</p>
											<p className="truncate text-[11px] text-fog-500">
												{device ? device.label : "No tracker assigned"}
											</p>
										</div>
										<div className="flex shrink-0 flex-col items-end gap-1">
											<DeviceStatusBadge state={state} />
											<span className="text-[10px] text-fog-500">
												{formatRelative(device?.lastSeenAt)}
											</span>
										</div>
									</Link>
								);
							})
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
