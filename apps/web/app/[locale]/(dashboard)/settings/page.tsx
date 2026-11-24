import { InstallCard } from "@/components/pwa/install-prompt";
import { InviteMemberForm } from "@/components/settings/invite-member-form";
import { MemberRowActions } from "@/components/settings/member-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
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
import { updateSettingsAction } from "@/lib/actions/settings";
import { isMembershipActive } from "@/lib/auth/membership";
import { canAdminister, requireRole, roleLabelKey } from "@/lib/auth/session";
import { DEVICE_OFFLINE_AFTER_MIN, DEVICE_WEAK_AFTER_MIN } from "@/lib/constants";
import { metadataForPage } from "@/lib/page-metadata";
import prisma from "@/lib/prisma";
import { MEMBER_LIST_SELECT } from "@/lib/settings/member-payload";
import { type ResolvedOrgSettings, getOrgSettings } from "@/lib/settings/org";
import {
	PERMISSION_ROLE_ORDER,
	type PermissionKey,
	SETTINGS_TABS,
	type SettingsTab,
	buildSettingsHref,
	clampAuditPage,
	isSettingsFormTab,
	parseAuditQuery,
	parseSettingsTab,
	permissionMatrix,
} from "@/lib/settings/workspace";
import { formatDateTime } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return metadataForPage(locale, "settings");
}

const roleTones = {
	ADMIN: "success",
	RESPONDER: "warning",
	USER: "info",
} as const;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SettingsPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<SearchParams>;
}) {
	const { locale } = await params;
	const raw = await searchParams;
	const saved = raw.saved === "1";
	const revoked = raw.revoked === "1";
	const error = typeof raw.error === "string" ? raw.error : "";
	const tab = parseSettingsTab(raw.tab);
	const auditQuery = parseAuditQuery(raw);
	const current = await requireRole("ADMIN");
	const t = await getTranslations({ locale, namespace: "settings" });

	const errorMessage =
		error === "forbidden"
			? t("adminOnly")
			: error === "self"
				? t("memberErrorSelf")
				: error === "last_admin"
					? t("memberErrorLastAdmin")
					: error === "already"
						? t("memberErrorAlready")
						: error === "notfound"
							? t("memberErrorNotFound")
							: error
								? t("errorInvalid")
								: null;

	const showForm = isSettingsFormTab(tab);
	const [org, settings] = showForm
		? await Promise.all([
				prisma.organization.findUnique({ where: { id: current.org.id } }),
				getOrgSettings(current.org.id),
			])
		: [null, null];
	const editable = canAdminister(current.role);

	const tabLabels: Record<SettingsTab, string> = {
		organization: t("organization"),
		thresholds: t("thresholds"),
		retention: t("retention"),
		members: t("members"),
		audit: t("audit"),
		health: t("health"),
	};

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			{saved ? (
				<p className="mb-4 rounded-panel border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-meta text-clear-300">
					{t("saved")}
				</p>
			) : null}
			{revoked ? (
				<p className="mb-4 rounded-panel border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-meta text-clear-300">
					{t("memberRevokedNotice")}
				</p>
			) : null}
			{errorMessage ? (
				<p className="mb-4 rounded-panel border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300">
					{errorMessage}
				</p>
			) : null}

			<div className="lg:flex lg:items-start lg:gap-6">
				<nav
					aria-label={t("sections")}
					className="mb-4 -mx-4 overflow-x-auto border-b border-ink-700 px-4 sm:mx-0 sm:px-0 lg:mb-0 lg:w-52 lg:shrink-0 lg:overflow-visible lg:border-b-0"
				>
					<ul className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
						{SETTINGS_TABS.map((item) => {
							const active = item === tab;
							return (
								<li key={item}>
									<Link
										href={buildSettingsHref(item)}
										aria-current={active ? "page" : undefined}
										className={
											active
												? "flex h-11 items-center whitespace-nowrap rounded-control border-l-2 border-signal-500 bg-ink-700/60 px-3 text-body font-medium text-fog-50 lg:h-9"
												: "flex h-11 items-center whitespace-nowrap rounded-control border-l-2 border-transparent px-3 text-body text-fog-500 transition-colors hover:bg-ink-800 hover:text-fog-100 lg:h-9"
										}
									>
										{tabLabels[item]}
									</Link>
								</li>
							);
						})}
					</ul>
				</nav>

				<div className="min-w-0 flex-1">
					<div className="mb-6">
						<InstallCard />
					</div>
					{showForm && settings ? (
						<SettingsForm
							tab={tab}
							locale={locale}
							orgName={org?.name ?? current.org.name}
							settings={settings}
							editable={editable}
						/>
					) : null}
					{tab === "members" ? (
						<MembersSection orgId={current.org.id} locale={locale} actorUserId={current.user.id} />
					) : null}
					{tab === "audit" ? (
						<AuditSection orgId={current.org.id} locale={locale} query={auditQuery} />
					) : null}
					{tab === "health" ? <HealthSection orgId={current.org.id} locale={locale} /> : null}
				</div>
			</div>
		</>
	);
}

async function SettingsForm({
	tab,
	locale,
	orgName,
	settings,
	editable,
}: {
	tab: SettingsTab;
	locale: string;
	orgName: string;
	settings: ResolvedOrgSettings;
	editable: boolean;
}) {
	const t = await getTranslations({ locale, namespace: "settings" });

	return (
		<form action={updateSettingsAction} className="grid gap-6 xl:grid-cols-3">
			<input type="hidden" name="locale" value={locale} />

			<div className={tab === "organization" ? "xl:col-span-2" : "hidden"}>
				<Card>
					<CardHeader>
						<CardTitle>{t("organization")}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<Field>
							<Label htmlFor="orgName">{t("orgName")}</Label>
							<Input
								id="orgName"
								name="orgName"
								defaultValue={orgName}
								disabled={!editable}
								required
							/>
						</Field>
						<Field>
							<Label htmlFor="phones">{t("phones")}</Label>
							<Textarea
								id="phones"
								name="phones"
								defaultValue={settings.alertPhones.join("\n")}
								placeholder={"+639171234567\n+639181234567"}
								disabled={!editable}
							/>
							<p className="text-meta text-fog-500">{t("phonesHint")}</p>
						</Field>
						<Field>
							<Label htmlFor="emails">{t("emails")}</Label>
							<Textarea
								id="emails"
								name="emails"
								defaultValue={settings.alertEmails.join("\n")}
								placeholder={"ops@example.com"}
								disabled={!editable}
							/>
							<p className="text-meta text-fog-500">{t("emailsHint")}</p>
						</Field>
					</CardContent>
				</Card>
			</div>

			<div className={tab === "thresholds" ? "xl:col-span-2" : "hidden"}>
				<Card>
					<CardHeader>
						<CardTitle>{t("thresholds")}</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3 sm:grid-cols-2">
						<Field>
							<Label htmlFor="impactThresholdG">{t("impactThreshold")}</Label>
							<Input
								id="impactThresholdG"
								name="impactThresholdG"
								type="number"
								min={1.5}
								max={5}
								step={0.1}
								defaultValue={settings.impactThresholdG}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="tiltThresholdDeg">{t("tiltThreshold")}</Label>
							<Input
								id="tiltThresholdDeg"
								name="tiltThresholdDeg"
								type="number"
								min={30}
								max={90}
								step={1}
								defaultValue={settings.tiltThresholdDeg}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="confirmWindowMs">{t("confirmWindow")}</Label>
							<Input
								id="confirmWindowMs"
								name="confirmWindowMs"
								type="number"
								min={100}
								max={2000}
								step={10}
								defaultValue={settings.confirmWindowMs}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="cancelWindowS">{t("cancelWindow")}</Label>
							<Input
								id="cancelWindowS"
								name="cancelWindowS"
								type="number"
								min={5}
								max={60}
								step={1}
								defaultValue={settings.cancelWindowS}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="heartbeatIntervalS">{t("heartbeatInterval")}</Label>
							<Input
								id="heartbeatIntervalS"
								name="heartbeatIntervalS"
								type="number"
								min={10}
								max={300}
								step={1}
								defaultValue={settings.heartbeatIntervalS}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="sosRetryS">{t("sosRetry")}</Label>
							<Input
								id="sosRetryS"
								name="sosRetryS"
								type="number"
								min={30}
								max={300}
								step={1}
								defaultValue={settings.sosRetryS}
								disabled={!editable}
							/>
						</Field>
					</CardContent>
				</Card>
			</div>

			<div className={tab === "retention" ? "xl:col-span-2" : "hidden"}>
				<Card>
					<CardHeader>
						<CardTitle>{t("retention")}</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3 sm:grid-cols-2">
						<Field>
							<Label htmlFor="telemetryRetentionDays">{t("telemetryRetention")}</Label>
							<Input
								id="telemetryRetentionDays"
								name="telemetryRetentionDays"
								type="number"
								min={1}
								max={3650}
								defaultValue={settings.telemetryRetentionDays}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="incidentRetentionDays">{t("incidentRetention")}</Label>
							<Input
								id="incidentRetentionDays"
								name="incidentRetentionDays"
								type="number"
								min={1}
								max={3650}
								defaultValue={settings.incidentRetentionDays}
								disabled={!editable}
							/>
						</Field>
					</CardContent>
				</Card>
			</div>

			<Card className="xl:col-span-1">
				<CardContent className="pt-5">
					<p className="text-meta leading-relaxed text-fog-500">{t("thresholdsNote")}</p>
					{!editable ? (
						<p className="mt-3 rounded-control border border-caution-400/30 bg-caution-400/10 px-3 py-2 text-meta text-caution-300">
							{t("adminOnly")}
						</p>
					) : null}
				</CardContent>
				<div className="border-t border-ink-700/70 p-5">
					<Button type="submit" disabled={!editable}>
						{t("saveSettings")}
					</Button>
				</div>
			</Card>
		</form>
	);
}

async function MembersSection({
	orgId,
	locale,
	actorUserId,
}: {
	orgId: string;
	locale: string;
	actorUserId: string;
}) {
	const t = await getTranslations({ locale, namespace: "settings" });
	const roleNames = await getTranslations({ locale, namespace: "roles" });
	const members = await prisma.membership.findMany({
		where: { orgId },
		select: MEMBER_LIST_SELECT,
		orderBy: { createdAt: "asc" },
	});
	const activeAdmins = members.filter(
		(member) => member.role === "ADMIN" && isMembershipActive(member),
	).length;
	const ordered = [...members].sort(
		(a, b) =>
			Number(!isMembershipActive(a)) - Number(!isMembershipActive(b)) ||
			a.createdAt.getTime() - b.createdAt.getTime(),
	);
	const matrix = permissionMatrix();
	const permissionLabels: Record<PermissionKey, string> = {
		incidents: t("permissionIncidents"),
		administration: t("permissionAdmin"),
	};

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>{t("inviteTitle")}</CardTitle>
					<CardDescription>{t("inviteHint")}</CardDescription>
				</CardHeader>
				<CardContent>
					<InviteMemberForm locale={locale} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("members")}</CardTitle>
					<CardDescription>{t("membersHint")}</CardDescription>
				</CardHeader>
				<CardContent>
					{members.length === 0 ? (
						<EmptyState title={t("membersEmpty")} />
					) : (
						<Table className="min-w-[720px]">
							<TableHeader>
								<TableRow>
									<TableHead>{t("name")}</TableHead>
									<TableHead>{t("email")}</TableHead>
									<TableHead>{t("role")}</TableHead>
									<TableHead>{t("memberStatus")}</TableHead>
									<TableHead>{t("memberSince")}</TableHead>
									<TableHead>{t("memberActions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{ordered.map((member) => {
									const active = isMembershipActive(member);
									return (
										<TableRow key={member.id}>
											<TableCell className="font-medium text-fog-100">{member.user.name}</TableCell>
											<TableCell className="font-mono text-meta text-fog-400">
												{member.user.email}
											</TableCell>
											<TableCell>
												<Badge tone={roleTones[member.role]}>
													{roleNames(roleLabelKey(member.role))}
												</Badge>
											</TableCell>
											<TableCell>
												<Badge tone={active ? "success" : "muted"}>
													{active ? t("statusActive") : t("statusRevoked")}
												</Badge>
											</TableCell>
											<TableCell className="text-meta text-fog-500">
												{formatDateTime(member.createdAt, locale)}
											</TableCell>
											<TableCell>
												<MemberRowActions
													locale={locale}
													membershipId={member.id}
													name={member.user.name}
													role={member.role}
													revoked={!active}
													isSelf={member.userId === actorUserId}
													isLastAdmin={member.role === "ADMIN" && activeAdmins <= 1}
												/>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("permissionsTitle")}</CardTitle>
					<CardDescription>{t("permissionsHint")}</CardDescription>
				</CardHeader>
				<CardContent>
					<Table className="min-w-[520px]">
						<TableHeader>
							<TableRow>
								<TableHead>{t("permission")}</TableHead>
								{PERMISSION_ROLE_ORDER.map((role) => (
									<TableHead key={role}>{roleNames(roleLabelKey(role))}</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{matrix.map((row) => (
								<TableRow key={row.key}>
									<TableCell className="text-fog-300">{permissionLabels[row.key]}</TableCell>
									{PERMISSION_ROLE_ORDER.map((role) => (
										<TableCell key={role}>
											<Badge tone={row.roles[role] ? "success" : "muted"}>
												{row.roles[role] ? t("allowed") : t("notAllowed")}
											</Badge>
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

async function AuditSection({
	orgId,
	locale,
	query,
}: {
	orgId: string;
	locale: string;
	query: { action: string; page: number };
}) {
	const t = await getTranslations({ locale, namespace: "settings" });

	const where: Prisma.AuditLogWhereInput = { orgId };
	if (query.action) where.action = { contains: query.action, mode: "insensitive" };

	const total = await prisma.auditLog.count({ where });
	const paging = clampAuditPage(query.page, total);
	const entries = await prisma.auditLog.findMany({
		where,
		include: { actor: { select: { name: true, email: true } } },
		orderBy: { createdAt: "desc" },
		skip: paging.skip,
		take: paging.take,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("audit")}</CardTitle>
				<CardDescription>{t("auditHint")}</CardDescription>
			</CardHeader>
			<CardContent>
				<form method="get" className="mb-4 flex flex-wrap items-end gap-2">
					<input type="hidden" name="tab" value="audit" />
					<Field className="w-full sm:w-72">
						<Label htmlFor="audit-action">{t("auditFilterLabel")}</Label>
						<Input
							id="audit-action"
							name="action"
							defaultValue={query.action}
							placeholder={t("auditFilterPlaceholder")}
							maxLength={80}
						/>
					</Field>
					<Button type="submit" variant="outline" size="sm">
						{t("auditFilterApply")}
					</Button>
					{query.action ? (
						<Link
							href="/settings?tab=audit"
							className="inline-flex h-8 items-center text-meta text-fog-400 hover:text-signal-300 hover:underline"
						>
							{t("auditClearFilter")}
						</Link>
					) : null}
				</form>

				<p className="mb-3 text-meta text-fog-500">{t("auditCount", { total })}</p>

				{entries.length === 0 ? (
					<EmptyState
						title={query.action ? t("auditNoMatch") : t("auditEmpty")}
						body={query.action ? t("auditClearHint") : undefined}
					/>
				) : (
					<Table className="min-w-[720px]">
						<TableHeader>
							<TableRow>
								<TableHead>{t("time")}</TableHead>
								<TableHead>{t("actor")}</TableHead>
								<TableHead>{t("action")}</TableHead>
								<TableHead>{t("target")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{entries.map((entry) => (
								<TableRow key={entry.id}>
									<TableCell className="whitespace-nowrap text-meta text-fog-500">
										{formatDateTime(entry.createdAt, locale)}
									</TableCell>
									<TableCell>
										{entry.actor ? (
											<>
												<span className="block text-fog-100">{entry.actor.name}</span>
												<span className="block font-mono text-meta text-fog-500">
													{entry.actor.email}
												</span>
											</>
										) : (
											<span className="text-meta text-fog-500">
												{entry.actorId ? t("removedUser") : t("systemActor")}
											</span>
										)}
									</TableCell>
									<TableCell className="font-mono text-meta text-fog-300">{entry.action}</TableCell>
									<TableCell className="font-mono text-meta text-fog-500">
										{entry.target ? (
											<span className="block max-w-40 truncate" title={entry.target}>
												{entry.target}
											</span>
										) : (
											"—"
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}

				{paging.pageCount > 1 ? (
					<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
						<span className="text-meta text-fog-500">
							{t("auditPage", { page: paging.page, pages: paging.pageCount })}
						</span>
						<div className="flex gap-2">
							{paging.page > 1 ? (
								<Link
									href={buildSettingsHref("audit", {
										action: query.action,
										page: paging.page - 1,
									})}
									className="inline-flex h-8 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60"
								>
									{t("previous")}
								</Link>
							) : null}
							{paging.page < paging.pageCount ? (
								<Link
									href={buildSettingsHref("audit", {
										action: query.action,
										page: paging.page + 1,
									})}
									className="inline-flex h-8 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60"
								>
									{t("next")}
								</Link>
							) : null}
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

async function HealthSection({ orgId, locale }: { orgId: string; locale: string }) {
	const t = await getTranslations({ locale, namespace: "settings" });
	const now = new Date();
	const weakCutoff = new Date(now.getTime() - DEVICE_WEAK_AFTER_MIN * 60_000);
	const offlineCutoff = new Date(now.getTime() - DEVICE_OFFLINE_AFTER_MIN * 60_000);

	const [online, weak, offline, never, pendingCommands, queuedAlerts] = await Promise.all([
		prisma.trackerDevice.count({ where: { orgId, lastSeenAt: { gte: weakCutoff } } }),
		prisma.trackerDevice.count({
			where: { orgId, lastSeenAt: { lt: weakCutoff, gte: offlineCutoff } },
		}),
		prisma.trackerDevice.count({ where: { orgId, lastSeenAt: { lt: offlineCutoff } } }),
		prisma.trackerDevice.count({ where: { orgId, lastSeenAt: null } }),
		prisma.deviceCommand.count({ where: { status: "PENDING", device: { orgId } } }),
		prisma.alertDelivery.count({ where: { status: "QUEUED", impact: { orgId } } }),
	]);

	const trackerRows = [
		{
			key: "online",
			label: t("healthOnline"),
			tone: "success" as const,
			count: online,
			href: "/devices?connection=online",
		},
		{
			key: "weak",
			label: t("healthWeak"),
			tone: "warning" as const,
			count: weak,
			href: "/devices?connection=weak",
		},
		{
			key: "offline",
			label: t("healthOffline"),
			tone: "danger" as const,
			count: offline,
			href: "/devices?connection=offline",
		},
		{
			key: "never",
			label: t("healthNever"),
			tone: "muted" as const,
			count: never,
			href: "/devices?connection=never",
		},
	];

	const operationRows = [
		{
			key: "commands",
			label: t("healthPendingCommands"),
			count: pendingCommands,
			href: "/devices",
			link: t("healthOpenTrackers"),
		},
		{
			key: "alerts",
			label: t("healthQueuedAlerts"),
			count: queuedAlerts,
			href: "/incidents",
			link: t("healthOpenIncidents"),
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("health")}</CardTitle>
				<CardDescription>{t("healthSource")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section aria-labelledby="health-trackers">
					<h3 id="health-trackers" className="mb-3 text-emphasis font-medium text-fog-100">
						{t("healthTrackers")}
					</h3>
					<Table className="min-w-[480px]">
						<TableHeader>
							<TableRow>
								<TableHead>{t("status")}</TableHead>
								<TableHead className="text-right">{t("count")}</TableHead>
								<TableHead className="text-right">{t("healthLink")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{trackerRows.map((row) => (
								<TableRow key={row.key}>
									<TableCell>
										<Badge tone={row.tone}>{row.label}</Badge>
									</TableCell>
									<TableCell className="text-right font-medium text-fog-100">{row.count}</TableCell>
									<TableCell className="text-right">
										<Link
											href={row.href}
											className="text-meta text-fog-400 hover:text-signal-300 hover:underline"
										>
											{t("healthOpenTrackers")}
										</Link>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</section>

				<section aria-labelledby="health-operations">
					<h3 id="health-operations" className="mb-3 text-emphasis font-medium text-fog-100">
						{t("healthOperations")}
					</h3>
					<Table className="min-w-[480px]">
						<TableHeader>
							<TableRow>
								<TableHead>{t("healthItem")}</TableHead>
								<TableHead className="text-right">{t("count")}</TableHead>
								<TableHead className="text-right">{t("healthLink")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{operationRows.map((row) => (
								<TableRow key={row.key}>
									<TableCell className="text-fog-300">{row.label}</TableCell>
									<TableCell className="text-right font-medium text-fog-100">{row.count}</TableCell>
									<TableCell className="text-right">
										<Link
											href={row.href}
											className="text-meta text-fog-400 hover:text-signal-300 hover:underline"
										>
											{row.link}
										</Link>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</section>
			</CardContent>
		</Card>
	);
}
