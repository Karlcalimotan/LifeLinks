import { BarChart, type BarChartDatum } from "@/components/analytics/bar-chart";
import { DistributionBars, type DistributionItem } from "@/components/analytics/distribution-bars";
import { RangeSelector } from "@/components/analytics/range-selector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
	acknowledgementSamples,
	analyticsWindow,
	averageDuration,
	countByHour,
	countByManilaDay,
	falseAlarmRate,
	formatDuration,
	parseAnalyticsRange,
	resolutionDurations,
	severityDistribution,
	slowestResponses,
	summarizeIncidents,
	topVehicles,
} from "@/lib/analytics/aggregate";
import { requireUser } from "@/lib/auth/session";
import { type Severity, severityLabel } from "@/lib/incidents/severity";
import { metadataForPage } from "@/lib/page-metadata";
import prisma from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { CircleSlash, Clock, ShieldAlert, Timer, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return metadataForPage(locale, "analytics");
}

const SEVERITY_BAR: Record<Severity, string> = {
	critical: "bg-alarm-500",
	high: "bg-caution-400",
	moderate: "bg-rescue-400",
	low: "bg-fog-500",
};

export default async function AnalyticsPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ range?: string | string[] }>;
}) {
	const { locale } = await params;
	const { range: rangeParam } = await searchParams;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "analytics" });

	const range = parseAnalyticsRange(rangeParam);
	const window = analyticsWindow(range, new Date());
	const scope = current.role === "USER" ? { vehicle: { is: { ownerId: current.user.id } } } : {};

	const [incidents, acknowledgements] = await Promise.all([
		prisma.impactEvent.findMany({
			where: {
				orgId: current.org.id,
				...scope,
				detectedAt: { gte: window.start, lte: window.end },
			},
			select: {
				id: true,
				detectedAt: true,
				status: true,
				resolvedAt: true,
				peakAccelG: true,
				tiltDeg: true,
				vehicleId: true,
				vehicle: { select: { plateNo: true } },
			},
			orderBy: { detectedAt: "asc" },
		}),
		prisma.auditLog.findMany({
			where: {
				orgId: current.org.id,
				action: "incident.acknowledged",
				createdAt: { gte: window.start, lte: window.end },
			},
			select: {
				target: true,
				createdAt: true,
				actor: { select: { name: true } },
			},
			orderBy: { createdAt: "asc" },
		}),
	]);

	const acknowledgementTargets = [
		...new Set(
			acknowledgements
				.map((audit) => audit.target)
				.filter((target): target is string => Boolean(target)),
		),
	];
	// Audit rows are org-wide because an operator may acknowledge an owner's
	// incident. The second lookup runs inside `scope`, so only incidents the
	// viewer may see reach the page.
	const acknowledgedIncidents =
		acknowledgementTargets.length === 0
			? []
			: await prisma.impactEvent.findMany({
					where: {
						orgId: current.org.id,
						id: { in: acknowledgementTargets },
						...scope,
					},
					select: {
						id: true,
						detectedAt: true,
						vehicleId: true,
						vehicle: { select: { plateNo: true } },
					},
				});

	const summary = summarizeIncidents(incidents);
	const alarmRate = falseAlarmRate(incidents);
	const acknowledgementPairs = acknowledgementSamples(
		acknowledgements.map((audit) => ({
			target: audit.target,
			createdAt: audit.createdAt,
			actorName: audit.actor?.name ?? null,
		})),
		acknowledgedIncidents,
	);
	const acknowledgementAverage = averageDuration(
		acknowledgementPairs.map((sample) => sample.elapsedMs),
	);
	const resolveAverage = averageDuration(resolutionDurations(incidents));
	const dayCounts = countByManilaDay(incidents, window.days);
	const hourCounts = countByHour(incidents);
	const vehicleCounts = topVehicles(incidents);
	const slowest = slowestResponses(acknowledgementPairs);
	const hasIncidents = incidents.length > 0;

	const dateLocale = locale === "tl" ? "fil-PH" : "en-PH";
	const dayTickFormat = new Intl.DateTimeFormat(dateLocale, {
		timeZone: "Asia/Manila",
		day: "2-digit",
	});
	const dayNameFormat = new Intl.DateTimeFormat(dateLocale, {
		timeZone: "Asia/Manila",
		month: "short",
		day: "numeric",
	});
	const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

	const dayData: BarChartDatum[] = dayCounts.map((day) => ({
		key: day.key,
		label: dayTickFormat.format(day.date),
		value: day.count,
		description: t("daySample", {
			date: dayNameFormat.format(day.date),
			count: day.count,
		}),
	}));
	const hourData: BarChartDatum[] = hourCounts.map((hour) => ({
		key: `hour-${hour.hour}`,
		label: hourLabel(hour.hour),
		value: hour.count,
		description: t("hourSample", { hour: hourLabel(hour.hour), count: hour.count }),
	}));
	const severityItems: DistributionItem[] = severityDistribution(incidents).map((entry) => ({
		key: entry.severity,
		label: severityLabel(entry.severity),
		value: entry.count,
		valueLabel: t("incidentCount", { count: entry.count }),
		barClassName: SEVERITY_BAR[entry.severity],
	}));
	const vehicleItems: DistributionItem[] = vehicleCounts.map((vehicle) => ({
		key: vehicle.vehicleId,
		label: (
			<Link href={`/vehicles/${vehicle.vehicleId}`} className="hover:underline">
				{vehicle.plateNo}
			</Link>
		),
		value: vehicle.count,
		valueLabel: t("incidentCount", { count: vehicle.count }),
		barClassName: "bg-rescue-400",
	}));

	return (
		<>
			<PageHeader
				title={t("title")}
				subtitle={current.role === "USER" ? t("ownerSubtitle") : t("subtitle")}
				actions={
					<RangeSelector
						active={range}
						ariaLabel={t("rangeLabel")}
						labels={{
							7: t("range7"),
							14: t("range14"),
							30: t("range30"),
						}}
					/>
				}
			/>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
				<StatCard
					label={t("incidents")}
					value={summary.total}
					icon={TriangleAlert}
					hint={t("incidentsHint", { count: summary.cancelled })}
				/>
				<StatCard
					label={t("realCrashes")}
					value={summary.realCrashes}
					icon={ShieldAlert}
					tone={summary.active > 0 ? "danger" : "default"}
					hint={t("realCrashesHint", {
						active: summary.active,
						resolved: summary.resolved,
					})}
				/>
				<StatCard
					label={t("falseAlarmRate")}
					value={alarmRate.rate == null ? "—" : `${Math.round(alarmRate.rate * 100)}%`}
					icon={CircleSlash}
					hint={t("falseAlarmHint", {
						numerator: alarmRate.numerator,
						denominator: alarmRate.denominator,
					})}
				/>
				<StatCard
					label={t("avgAck")}
					value={formatDuration(acknowledgementAverage.averageMs)}
					icon={Timer}
					hint={t("ackSamples", { count: acknowledgementAverage.count })}
				/>
				<div className="col-span-2 sm:col-span-1">
					<StatCard
						label={t("avgResolve")}
						value={formatDuration(resolveAverage.averageMs)}
						icon={Clock}
						hint={t("resolveSamples", { count: resolveAverage.count })}
					/>
				</div>
			</div>

			<div className="mt-3 flex flex-col gap-1 text-meta text-fog-500">
				{hasIncidents ? null : <p>{t("emptyRangeNote", { days: range })}</p>}
				<p className="max-w-3xl leading-relaxed">{t("falseAlarmNote")}</p>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("perDayTitle")}</CardTitle>
						<CardDescription>{t("perDayDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						{hasIncidents ? (
							<BarChart
								title={t("perDayChartLabel", { days: range })}
								data={dayData}
								tickEvery={range === 30 ? 5 : 1}
							/>
						) : (
							<EmptyState title={t("noIncidents")} body={t("noIncidentsBody")} />
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("severityTitle")}</CardTitle>
						<CardDescription>{t("severityDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						{hasIncidents ? (
							<DistributionBars title={t("severityChartLabel")} items={severityItems} />
						) : (
							<EmptyState title={t("noIncidents")} body={t("noIncidentsBody")} />
						)}
					</CardContent>
				</Card>
			</div>

			<Card className="mt-6">
				<CardHeader>
					<CardTitle>{t("hourTitle")}</CardTitle>
					<CardDescription>{t("hourDescription")}</CardDescription>
				</CardHeader>
				<CardContent>
					{hasIncidents ? (
						<BarChart title={t("hourChartLabel")} data={hourData} tickEvery={3} />
					) : (
						<EmptyState title={t("noIncidents")} body={t("noIncidentsBody")} />
					)}
				</CardContent>
			</Card>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.55fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("topVehiclesTitle")}</CardTitle>
						<CardDescription>{t("topVehiclesDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						{vehicleItems.length === 0 ? (
							<EmptyState title={t("noIncidents")} body={t("noIncidentsBody")} />
						) : (
							<DistributionBars title={t("topVehiclesChartLabel")} items={vehicleItems} />
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("slowestTitle")}</CardTitle>
						<CardDescription>{t("slowestDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						{slowest.length === 0 ? (
							<EmptyState title={t("slowestEmpty")} body={t("slowestEmptyBody")} />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t("tableVehicle")}</TableHead>
										<TableHead>{t("tableDetected")}</TableHead>
										<TableHead>{t("tableElapsed")}</TableHead>
										<TableHead className="hidden sm:table-cell">{t("tableActor")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{slowest.map((response) => (
										<TableRow key={response.incidentId}>
											<TableCell className="whitespace-nowrap text-fog-100">
												{response.plateNo}
											</TableCell>
											<TableCell>
												<Link
													href={`/incidents/${response.incidentId}`}
													className="font-medium text-fog-100 hover:underline"
												>
													{formatDateTime(response.detectedAt, locale)}
												</Link>
											</TableCell>
											<TableCell className="whitespace-nowrap font-medium text-fog-100">
												{formatDuration(response.elapsedMs)}
											</TableCell>
											<TableCell className="hidden whitespace-nowrap text-fog-500 sm:table-cell">
												{response.actorName ?? "—"}
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
