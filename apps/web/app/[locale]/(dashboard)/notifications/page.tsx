import { AlertStatusBadge } from "@/components/notifications/alert-status-badge";
import { NotificationLogCardList } from "@/components/notifications/notification-log-card-list";
import { NotificationsToolbar } from "@/components/notifications/notifications-toolbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { alertTargetsFromSettings } from "@/lib/alerts/templates";
import { canAdminister, requireRole } from "@/lib/auth/session";
import { summarizeTargets } from "@/lib/notifications/policy";
import {
	NOTIFICATION_PAGE_SIZE,
	type NotificationsQuery,
	buildNotificationsHref,
	clampPagination,
	hasActiveFilters,
	notificationsWhere,
	parseNotificationsQuery,
} from "@/lib/notifications/query";
import { metadataForPage } from "@/lib/page-metadata";
import prisma from "@/lib/prisma";
import { getOrgSettings } from "@/lib/settings/org";
import { formatDateTime } from "@/lib/utils";
import type { AlertChannel, AlertStatus } from "@prisma/client";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return metadataForPage(locale, "notifications");
}

const STATUS_LABELS: Record<AlertStatus, string> = {
	QUEUED: "statusQueued",
	SENT: "statusSent",
	FAILED: "statusFailed",
	ACKNOWLEDGED: "statusAcknowledged",
};

const CHANNEL_LABELS: Record<AlertChannel, string> = {
	SMS: "channelSms",
	EMAIL: "channelEmail",
	HTTP: "channelHttp",
};

const POLICY_ROWS = [
	{ label: "policyTriggerLabel", body: "policyTriggerBody" },
	{ label: "policyTargetsLabel", body: "policyTargetsBody" },
	{ label: "policyMessageLabel", body: "policyMessageBody" },
	{ label: "policyDeliveryLabel", body: "policyDeliveryBody" },
	{ label: "policySeverityLabel", body: "policySeverityBody" },
	{ label: "policyEscalationLabel", body: "policyEscalationBody" },
] as const;

const pagerLink =
	"inline-flex h-8 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60";
const pagerDisabled =
	"inline-flex h-8 items-center rounded-panel border border-ink-700 px-3 text-meta text-fog-500 opacity-60";

export default async function NotificationsPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { locale } = await params;
	const query = parseNotificationsQuery(await searchParams);
	const current = await requireRole("ADMIN", "RESPONDER");
	const t = await getTranslations({ locale, namespace: "notifications" });

	const settings = await getOrgSettings(current.org.id);
	const targets = alertTargetsFromSettings(settings);
	const targetSummary = summarizeTargets(targets);
	const phones = [...new Set(targets.phones)];
	const emails = [...new Set(targets.emails)];
	const where = notificationsWhere(current.org.id, query);

	const [total, contacts] = await Promise.all([
		prisma.alertDelivery.count({ where }),
		prisma.emergencyContact.findMany({
			where: { orgId: current.org.id },
			orderBy: [{ active: "desc" }, { name: "asc" }],
			select: { id: true, name: true, phone: true, email: true, active: true },
		}),
	]);

	const paging = clampPagination(total, query.page);
	const effectiveQuery: NotificationsQuery = { ...query, page: paging.page };
	const rows = await prisma.alertDelivery.findMany({
		where,
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		skip: paging.skip,
		take: NOTIFICATION_PAGE_SIZE,
		select: {
			id: true,
			channel: true,
			target: true,
			status: true,
			attempts: true,
			error: true,
			createdAt: true,
			impact: {
				select: {
					id: true,
					vehicle: { select: { plateNo: true } },
				},
			},
		},
	});

	const filtersActive = hasActiveFilters(query);
	const canEditTargets = canAdminister(current.role);

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			<output className="mb-6 flex items-start gap-2.5 rounded-panel border border-caution-400/30 bg-caution-400/10 px-3 py-2.5">
				<TriangleAlert className="mt-0.5 size-4 shrink-0 text-caution-300" aria-hidden="true" />
				<span>
					<span className="block text-body font-medium text-caution-300">{t("senderTitle")}</span>
					<span className="mt-0.5 block text-meta leading-relaxed text-fog-300">
						{t("senderBody")}
					</span>
				</span>
			</output>

			<div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("policyTitle")}</CardTitle>
						<CardDescription>{t("policySubtitle")}</CardDescription>
					</CardHeader>
					<CardContent>
						<dl className="flex flex-col divide-y divide-ink-700/70">
							{POLICY_ROWS.map((row) => (
								<div key={row.label} className="py-3 first:pt-0 last:pb-0">
									<dt className="text-meta font-medium text-fog-300">{t(row.label)}</dt>
									<dd className="mt-1 text-body leading-relaxed text-fog-500">{t(row.body)}</dd>
								</div>
							))}
						</dl>
					</CardContent>
				</Card>

				<Card className="flex flex-col">
					<CardHeader>
						<CardTitle>{t("targetsTitle")}</CardTitle>
						<CardDescription>{t("targetsSubtitle")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-1 flex-col gap-4">
						{targetSummary.total === 0 ? (
							<EmptyState title={t("targetsEmptyTitle")} body={t("targetsEmptyBody")} />
						) : (
							<>
								<div>
									<h3 className="text-meta font-medium text-fog-300">{t("targetsPhones")}</h3>
									{phones.length === 0 ? (
										<p className="mt-1 text-meta text-fog-500">{t("targetsNonePhone")}</p>
									) : (
										<ul className="mt-2 flex flex-col divide-y divide-ink-700/70">
											{phones.map((phone) => (
												<li key={phone} className="py-2 font-mono text-body text-fog-100">
													{phone}
												</li>
											))}
										</ul>
									)}
								</div>
								<div>
									<h3 className="text-meta font-medium text-fog-300">{t("targetsEmails")}</h3>
									{emails.length === 0 ? (
										<p className="mt-1 text-meta text-fog-500">{t("targetsNoneEmail")}</p>
									) : (
										<ul className="mt-2 flex flex-col divide-y divide-ink-700/70">
											{emails.map((email) => (
												<li key={email} className="break-all py-2 font-mono text-body text-fog-100">
													{email}
												</li>
											))}
										</ul>
									)}
								</div>
							</>
						)}

						<p className="text-meta leading-relaxed text-fog-500">{t("targetsNormalizeNote")}</p>

						<div className="mt-auto border-t border-ink-700 pt-4">
							{canEditTargets ? (
								<Link
									href="/settings"
									className="text-meta text-fog-300 underline-offset-2 hover:text-signal-300 hover:underline"
								>
									{t("targetsEdit")}
								</Link>
							) : (
								<p className="text-meta text-fog-500">{t("targetsManagedByAdmin")}</p>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="mt-6">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{t("logTitle")}</CardTitle>
						<CardDescription>{t("logSubtitle")}</CardDescription>
					</CardHeader>
					<CardContent>
						<NotificationsToolbar locale={locale} query={effectiveQuery} total={total} />

						{rows.length === 0 ? (
							<div>
								<EmptyState
									title={filtersActive ? t("logEmptyFiltered") : t("logEmpty")}
									body={filtersActive ? t("logEmptyFilteredBody") : t("logEmptyBody")}
								/>
								{filtersActive ? (
									<div className="mt-3 text-center">
										<Link
											href="/notifications"
											className="text-meta text-fog-300 underline-offset-2 hover:text-signal-300 hover:underline"
										>
											{t("clearFilters")}
										</Link>
									</div>
								) : null}
							</div>
						) : (
							<>
								<div className="hidden lg:block">
									<Table className="min-w-[900px]">
										<TableHeader>
											<TableRow>
												<TableHead>{t("time")}</TableHead>
												<TableHead>{t("incident")}</TableHead>
												<TableHead>{t("channel")}</TableHead>
												<TableHead>{t("target")}</TableHead>
												<TableHead>{t("status")}</TableHead>
												<TableHead>{t("attempts")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{rows.map((row) => (
												<TableRow key={row.id}>
													<TableCell className="whitespace-nowrap text-meta text-fog-500">
														{formatDateTime(row.createdAt, locale)}
													</TableCell>
													<TableCell>
														<Link
															href={`/incidents/${row.impact.id}`}
															aria-label={t("openIncident", {
																plate: row.impact.vehicle.plateNo,
															})}
															className="font-medium text-fog-100 hover:text-signal-300 hover:underline"
														>
															{row.impact.vehicle.plateNo}
														</Link>
														<span className="mt-0.5 block font-mono text-meta text-fog-500">
															{row.impact.id}
														</span>
													</TableCell>
													<TableCell className="text-body text-fog-300">
														{t(CHANNEL_LABELS[row.channel])}
													</TableCell>
													<TableCell className="font-mono text-meta text-fog-300">
														<span className="block max-w-64 truncate" title={row.target}>
															{row.target}
														</span>
														{row.status === "FAILED" && row.error ? (
															<span
																className="mt-0.5 block max-w-64 truncate text-meta text-alarm-300"
																title={row.error}
															>
																{row.error}
															</span>
														) : null}
													</TableCell>
													<TableCell>
														<AlertStatusBadge
															status={row.status}
															label={t(STATUS_LABELS[row.status])}
														/>
													</TableCell>
													<TableCell className="tabular-nums text-fog-300">
														{row.attempts}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
								<div className="lg:hidden">
									<NotificationLogCardList locale={locale} rows={rows} />
								</div>
							</>
						)}

						{total > 0 ? (
							<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
								<span className="text-meta text-fog-500">
									{t("showing", { from: paging.from, to: paging.to, total })}
								</span>
								<div className="flex flex-wrap items-center gap-2">
									{paging.page > 1 ? (
										<Link
											href={buildNotificationsHref(effectiveQuery, { page: paging.page - 1 })}
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
										{t("pageOf", { page: paging.page, pages: paging.pageCount })}
									</span>
									{paging.page < paging.pageCount ? (
										<Link
											href={buildNotificationsHref(effectiveQuery, { page: paging.page + 1 })}
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
			</div>

			<div className="mt-6">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{t("contactsTitle")}</CardTitle>
						<CardDescription>{t("contactsSubtitle")}</CardDescription>
					</CardHeader>
					<CardContent>
						{contacts.length === 0 ? (
							<EmptyState title={t("contactsEmptyTitle")} body={t("contactsEmptyBody")} />
						) : (
							<>
								<div className="hidden lg:block">
									<Table className="min-w-[600px]">
										<TableHeader>
											<TableRow>
												<TableHead>{t("contactName")}</TableHead>
												<TableHead>{t("contactPhone")}</TableHead>
												<TableHead>{t("contactEmail")}</TableHead>
												<TableHead>{t("contactStatus")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{contacts.map((contact) => (
												<TableRow key={contact.id}>
													<TableCell className="font-medium text-fog-100">{contact.name}</TableCell>
													<TableCell className="font-mono text-meta text-fog-300">
														{contact.phone}
													</TableCell>
													<TableCell className="font-mono text-meta text-fog-300">
														{contact.email ?? "—"}
													</TableCell>
													<TableCell>
														<Badge tone={contact.active ? "success" : "muted"}>
															{contact.active ? t("contactActive") : t("contactInactive")}
														</Badge>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
								<div className="lg:hidden">
									<ul className="flex flex-col divide-y divide-ink-700/70">
										{contacts.map((contact) => (
											<li
												key={contact.id}
												className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1"
											>
												<div className="flex flex-wrap items-start justify-between gap-2">
													<p className="min-w-0 break-words font-medium text-emphasis text-fog-100">
														{contact.name}
													</p>
													<Badge tone={contact.active ? "success" : "muted"}>
														{contact.active ? t("contactActive") : t("contactInactive")}
													</Badge>
												</div>
												<dl className="grid grid-cols-1 gap-y-3 text-meta">
													<div className="min-w-0">
														<dt className="text-fog-500">{t("contactPhone")}</dt>
														<dd className="mt-0.5 break-all font-mono text-fog-300">
															{contact.phone}
														</dd>
													</div>
													<div className="min-w-0">
														<dt className="text-fog-500">{t("contactEmail")}</dt>
														<dd className="mt-0.5 break-all font-mono text-fog-300">
															{contact.email ?? "—"}
														</dd>
													</div>
												</dl>
											</li>
										))}
									</ul>
								</div>
							</>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
