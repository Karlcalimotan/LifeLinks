import { IncidentStatusBadge, SeverityBadge } from "@/components/domain/badges";
import { IncidentCardList } from "@/components/incidents/incident-card-list";
import { IncidentStatusChips } from "@/components/incidents/incident-status-chips";
import { IncidentsToolbar } from "@/components/incidents/incidents-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { acknowledgeIncidentAction } from "@/lib/actions/incidents";
import { canAcknowledgeAsBureau, requireUser } from "@/lib/auth/session";
import { acknowledgementDuration } from "@/lib/incidents/acknowledgement";
import {
	INCIDENT_PAGE_SIZE,
	type IncidentRangeFilter,
	type IncidentStatusFilter,
	type IncidentsQuery,
	buildIncidentsHref,
	hasActiveFilters,
	incidentOrderBy,
	incidentWhere,
	parseIncidentsQuery,
} from "@/lib/incidents/query";
import type { Severity } from "@/lib/incidents/severity";
import { metadataForPage } from "@/lib/page-metadata";
import prisma from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return metadataForPage(locale, "incidents");
}

const STATUS_LABELS: Record<IncidentStatusFilter, string> = {
	SUSPECTED: "statusSuspected",
	CONFIRMED: "statusConfirmed",
	ACKNOWLEDGED: "statusAcknowledged",
	RESOLVED: "statusResolved",
	CANCELLED: "statusCancelled",
	FALSE_ALARM: "statusFalseAlarm",
};

const SEVERITY_LABELS: Record<Severity, string> = {
	critical: "severityCritical",
	high: "severityHigh",
	moderate: "severityModerate",
	low: "severityLow",
};

const RANGE_LABELS: Record<Exclude<IncidentRangeFilter, "all">, string> = {
	"7": "range7",
	"14": "range14",
	"30": "range30",
};

const pagerLink =
	"inline-flex h-8 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60";
const pagerDisabled =
	"inline-flex h-8 items-center rounded-panel border border-ink-700 px-3 text-meta text-fog-500 opacity-60";

export default async function IncidentsPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { locale } = await params;
	const raw = await searchParams;
	const query = parseIncidentsQuery(raw);
	const error = typeof raw.error === "string" ? raw.error : "";
	const updated = raw.updated === "1";
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "incidents" });
	const now = new Date();

	const ownership =
		current.role === "USER" ? { vehicle: { is: { ownerId: current.user.id } } } : {};
	const scope: Prisma.ImpactEventWhereInput = { orgId: current.org.id, ...ownership };
	const where = incidentWhere(scope, query, now);
	const countsWhere = incidentWhere(scope, { ...query, status: null }, now);

	const [total, statusGroups] = await Promise.all([
		prisma.impactEvent.count({ where }),
		prisma.impactEvent.groupBy({
			by: ["status"],
			where: countsWhere,
			_count: { _all: true },
		}),
	]);

	const pageCount = Math.max(1, Math.ceil(total / INCIDENT_PAGE_SIZE));
	const page = Math.min(query.page, pageCount);
	const effectiveQuery: IncidentsQuery = { ...query, page };

	if (query.page > pageCount) {
		redirect(`/${locale}${buildIncidentsHref(effectiveQuery)}`);
	}
	const statusCounts: Record<string, number> = {};
	let allCount = 0;
	for (const group of statusGroups) {
		statusCounts[group.status] = group._count._all;
		allCount += group._count._all;
	}

	const incidents = await prisma.impactEvent.findMany({
		where,
		orderBy: incidentOrderBy(effectiveQuery),
		skip: (page - 1) * INCIDENT_PAGE_SIZE,
		take: INCIDENT_PAGE_SIZE,
		select: {
			id: true,
			detectedAt: true,
			peakAccelG: true,
			tiltDeg: true,
			status: true,
			lat: true,
			lng: true,
			vehicleId: true,
			vehicle: { select: { plateNo: true, driverName: true } },
			alerts: { select: { status: true } },
		},
	});

	const acknowledgementRows =
		incidents.length > 0
			? await prisma.auditLog.findMany({
					where: {
						orgId: current.org.id,
						action: "incident.acknowledged",
						target: { in: incidents.map((incident) => incident.id) },
					},
					select: { target: true, createdAt: true },
					orderBy: { createdAt: "asc" },
				})
			: [];
	const acknowledgedAt = new Map<string, Date>();
	for (const row of acknowledgementRows) {
		if (row.target && !acknowledgedAt.has(row.target)) {
			acknowledgedAt.set(row.target, row.createdAt);
		}
	}

	const filtersActive = hasActiveFilters(query);
	const filterSummary: string[] = [];
	if (query.q) filterSummary.push(`“${query.q}”`);
	if (query.status) filterSummary.push(t(STATUS_LABELS[query.status]));
	if (query.severity) filterSummary.push(t(SEVERITY_LABELS[query.severity]));
	if (query.range !== "all") filterSummary.push(t(RANGE_LABELS[query.range]));

	const sortHref = buildIncidentsHref(effectiveQuery, {
		sort: "detected",
		dir: effectiveQuery.dir === "asc" ? "desc" : "asc",
		page: 1,
	});
	const returnTo = buildIncidentsHref(effectiveQuery);
	const from = (page - 1) * INCIDENT_PAGE_SIZE + 1;
	const to = Math.min(page * INCIDENT_PAGE_SIZE, total);

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			{updated ? (
				<p className="mb-4 rounded-panel border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-meta text-clear-300">
					{t("statusUpdated")}
				</p>
			) : null}
			{error === "notfound" ? (
				<p className="mb-4 rounded-panel border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300">
					{t("errorNotFound")}
				</p>
			) : null}
			{error === "ack_not_dispatched" ? (
				<p className="mb-4 rounded-panel border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300">
					{t("errorAckNotDispatched")}
				</p>
			) : null}

			<Card className="min-w-0 overflow-hidden">
				<CardContent className="min-w-0 pt-5">
					<IncidentsToolbar locale={locale} query={effectiveQuery} total={total} />
					<IncidentStatusChips
						locale={locale}
						query={effectiveQuery}
						counts={statusCounts}
						allCount={allCount}
					/>

					{incidents.length === 0 ? (
						<div>
							<EmptyState
								title={filtersActive ? t("emptyFiltered") : t("empty")}
								body={
									filtersActive ? `${t("activeFilters")}: ${filterSummary.join(" · ")}` : undefined
								}
							/>
							{filtersActive ? (
								<div className="mt-3 text-center">
									<Link
										href="/incidents"
										className="text-meta text-fog-300 underline-offset-2 hover:text-signal-300 hover:underline"
									>
										{t("clearFilters")}
									</Link>
								</div>
							) : null}
						</div>
					) : (
						<>
							<div className="lg:hidden">
								<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
									<span className="text-meta text-fog-500">{t("sortDetected")}</span>
									<Link
										href={sortHref}
										className="inline-flex h-8 items-center gap-1 rounded-control border border-ink-700 px-2 text-meta text-fog-300 hover:border-ink-600 hover:text-fog-100"
									>
										{effectiveQuery.dir === "asc" ? t("sortOldest") : t("sortNewest")}
										{effectiveQuery.dir === "asc" ? (
											<ChevronUp className="size-4" aria-hidden="true" />
										) : (
											<ChevronDown className="size-4" aria-hidden="true" />
										)}
									</Link>
								</div>
								<IncidentCardList
									locale={locale}
									incidents={incidents}
									acknowledgedAt={acknowledgedAt}
									now={now}
									canManage={canAcknowledgeAsBureau(current.role)}
									returnTo={returnTo}
								/>
							</div>
							<div className="hidden lg:block">
								<Table className="min-w-[960px]">
									<TableHeader>
										<TableRow>
											<TableHead
												aria-sort={effectiveQuery.dir === "asc" ? "ascending" : "descending"}
											>
												<Link
													href={sortHref}
													title={t("sortDetected")}
													aria-label={
														effectiveQuery.dir === "asc" ? t("sortOldest") : t("sortNewest")
													}
													className="inline-flex items-center gap-1 hover:text-fog-100"
												>
													{t("detected")}
													{effectiveQuery.dir === "asc" ? (
														<ChevronUp className="size-4" aria-hidden="true" />
													) : (
														<ChevronDown className="size-4" aria-hidden="true" />
													)}
												</Link>
											</TableHead>
											<TableHead>{t("vehicle")}</TableHead>
											<TableHead>{t("severity")}</TableHead>
											<TableHead>{t("status")}</TableHead>
											<TableHead>{t("location")}</TableHead>
											<TableHead>{t("alertDelivery")}</TableHead>
											<TableHead>{t("timeToAcknowledge")}</TableHead>
											<TableHead className="text-right">{t("actions")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{incidents.map((incident) => {
											const delivered = incident.alerts.filter(
												(alert) => alert.status === "SENT" || alert.status === "ACKNOWLEDGED",
											).length;
											const canAcknowledge =
												canAcknowledgeAsBureau(current.role) &&
												(incident.status === "CONFIRMED" || incident.status === "SUSPECTED");

											return (
												<TableRow key={incident.id}>
													<TableCell>
														<Link
															href={`/incidents/${incident.id}`}
															aria-label={t("openIncident", {
																time: formatDateTime(incident.detectedAt, locale),
															})}
															className="font-medium text-fog-100 hover:text-signal-300 hover:underline"
														>
															{formatDateTime(incident.detectedAt, locale)}
														</Link>
														<span className="mt-0.5 block font-mono text-meta text-fog-500">
															{incident.id} · {formatRelative(incident.detectedAt)}
														</span>
													</TableCell>
													<TableCell>
														<Link
															href={`/vehicles/${incident.vehicleId}`}
															className="text-fog-100 hover:text-signal-300 hover:underline"
														>
															{incident.vehicle.plateNo}
														</Link>
														<span className="mt-0.5 block text-meta text-fog-500">
															{incident.vehicle.driverName ?? "—"}
														</span>
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
													<TableCell className="whitespace-nowrap font-mono text-meta text-fog-500">
														{incident.lat != null && incident.lng != null
															? `${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)}`
															: "—"}
													</TableCell>
													<TableCell>
														{incident.alerts.length === 0 ? (
															<span className="text-fog-500">—</span>
														) : (
															<span className="tabular-nums text-fog-300">
																{delivered} / {incident.alerts.length}
															</span>
														)}
													</TableCell>
													<TableCell className="whitespace-nowrap font-mono text-meta text-fog-300">
														{acknowledgementDuration({
															status: incident.status,
															detectedAt: incident.detectedAt,
															acknowledgedAt: acknowledgedAt.get(incident.id) ?? null,
															now,
														})}
													</TableCell>
													<TableCell className="text-right">
														{canAcknowledge ? (
															<form action={acknowledgeIncidentAction} className="inline-flex">
																<input type="hidden" name="locale" value={locale} />
																<input type="hidden" name="incidentId" value={incident.id} />
																<input type="hidden" name="returnTo" value={returnTo} />
																<Button type="submit" size="sm" variant="secondary">
																	{t("acknowledge")}
																</Button>
															</form>
														) : (
															<span className="text-fog-500">—</span>
														)}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						</>
					)}

					{total > 0 ? (
						<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
							<span className="text-meta text-fog-500">{t("showing", { from, to, total })}</span>
							<div className="flex flex-wrap items-center gap-2">
								{page > 1 ? (
									<Link
										href={buildIncidentsHref(effectiveQuery, { page: page - 1 })}
										className={pagerLink}
									>
										{t("previous")}
									</Link>
								) : (
									<span aria-disabled="true" className={pagerDisabled}>
										{t("previous")}
									</span>
								)}
								<span className="text-meta text-fog-500">
									{t("pageOf", { page, pages: pageCount })}
								</span>
								{page < pageCount ? (
									<Link
										href={buildIncidentsHref(effectiveQuery, { page: page + 1 })}
										className={pagerLink}
									>
										{t("next")}
									</Link>
								) : (
									<span aria-disabled="true" className={pagerDisabled}>
										{t("next")}
									</span>
								)}
							</div>
						</div>
					) : null}
				</CardContent>
			</Card>
		</>
	);
}
