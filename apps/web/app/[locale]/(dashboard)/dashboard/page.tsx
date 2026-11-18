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
import { requireUser } from "@/lib/auth/session";
import { DEVICE_OFFLINE_AFTER_MIN } from "@/lib/constants";
import { deviceConnectionState } from "@/lib/device/status";
import prisma from "@/lib/prisma";
import { minutesAgo } from "@/lib/time";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { Car, Radio, ShieldAlert, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "dashboard" });
	const v = await getTranslations({ locale, namespace: "vehicles" });

	const now = new Date();
	const onlineCutoff = minutesAgo(DEVICE_OFFLINE_AFTER_MIN, now);
	const today = new Date(
		`${new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Manila",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(now)}T00:00:00+08:00`,
	);

	const [vehicleCount, onlineCount, openIncidents, alertsToday, recentIncidents, vehicles] =
		await Promise.all([
			prisma.vehicle.count({ where: { orgId: current.org.id } }),
			prisma.trackerDevice.count({
				where: { orgId: current.org.id, lastSeenAt: { gte: onlineCutoff } },
			}),
			prisma.impactEvent.count({
				where: {
					orgId: current.org.id,
					status: { in: ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED"] },
				},
			}),
			prisma.impactEvent.count({
				where: { orgId: current.org.id, detectedAt: { gte: today } },
			}),
			prisma.impactEvent.findMany({
				where: { orgId: current.org.id },
				orderBy: { detectedAt: "desc" },
				take: 5,
				include: { vehicle: true, alerts: true },
			}),
			prisma.vehicle.findMany({
				where: { orgId: current.org.id },
				orderBy: { plateNo: "asc" },
				take: 8,
				include: { devices: true },
			}),
		]);

	return (
		<>
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				actions={
					<Link
						href="/incidents"
						className="inline-flex h-8 items-center rounded-lg border border-slate-700 px-3 text-xs text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
					>
						{t("viewAll")}
					</Link>
				}
			/>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard label={t("totalVehicles")} value={vehicleCount} icon={Car} />
				<StatCard
					label={t("onlineTrackers")}
					value={onlineCount}
					icon={Radio}
					tone="success"
					hint={`${DEVICE_OFFLINE_AFTER_MIN} min offline window`}
				/>
				<StatCard
					label={t("openIncidents")}
					value={openIncidents}
					icon={TriangleAlert}
					tone={openIncidents > 0 ? "danger" : "default"}
				/>
				<StatCard
					label={t("alertsToday")}
					value={alertsToday}
					icon={ShieldAlert}
					hint="Asia/Manila"
				/>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
				<Card>
					<CardHeader className="flex-row items-center justify-between">
						<CardTitle>{t("recentIncidents")}</CardTitle>
						<Link href="/incidents" className="text-[11px] text-brand-400 hover:text-brand-300">
							{t("viewAll")}
						</Link>
					</CardHeader>
					<CardContent>
						{recentIncidents.length === 0 ? (
							<EmptyState title={t("noIncidents")} />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Detected</TableHead>
										<TableHead>Vehicle</TableHead>
										<TableHead>Severity</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Alerts</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{recentIncidents.map((incident) => (
										<TableRow key={incident.id}>
											<TableCell>
												<Link
													href={`/incidents/${incident.id}`}
													className="text-brand-400 hover:text-brand-300"
												>
													{formatDateTime(incident.detectedAt, locale)}
												</Link>
											</TableCell>
											<TableCell className="text-slate-200">{incident.vehicle.plateNo}</TableCell>
											<TableCell>
												<SeverityBadge
													peakAccelG={incident.peakAccelG}
													tiltDeg={incident.tiltDeg}
												/>
											</TableCell>
											<TableCell>
												<IncidentStatusBadge status={incident.status} />
											</TableCell>
											<TableCell className="text-xs text-slate-400">
												{incident.alerts.length}
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
						<CardTitle>{t("fleetStatus")}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{vehicles.length === 0 ? (
							<EmptyState title={v("empty")} />
						) : (
							vehicles.map((vehicle) => {
								const device = vehicle.devices[0];
								const state = deviceConnectionState(device?.lastSeenAt, now);
								return (
									<Link
										key={vehicle.id}
										href={`/vehicles/${vehicle.id}`}
										className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2.5 transition-colors hover:border-slate-700 hover:bg-slate-900/50"
									>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-slate-200">
												{vehicle.plateNo}
											</p>
											<p className="truncate text-[11px] text-slate-500">
												{vehicle.make} {vehicle.model}
												{device ? ` · ${device.label}` : " · no tracker"}
											</p>
										</div>
										<div className="flex shrink-0 flex-col items-end gap-1">
											<DeviceStatusBadge state={state} />
											<span className="text-[10px] text-slate-500">
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
