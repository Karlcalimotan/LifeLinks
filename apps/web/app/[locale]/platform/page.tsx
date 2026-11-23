import { Logo } from "@/components/brand/logo";
import { OrganizationActions } from "@/components/platform/organization-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { platformLogoutAction } from "@/lib/actions/auth";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { platformAdminDevelopmentMode } from "@/lib/platform/gate";
import {
	PLATFORM_AUDIT_ACTIONS,
	PLATFORM_ORG_LIST_SELECT,
	PLATFORM_ORG_REINSTATED,
	PLATFORM_ORG_SUSPENDED,
	auditReason,
	toPlatformOrgListItem,
} from "@/lib/platform/orgs";
import prisma from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { Building2, History, LogOut, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "platform" });
	return {
		title: t("title"),
		// The platform console is an internal operator surface.
		robots: { index: false, follow: false },
	};
}

export default async function PlatformPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ suspended?: string; reinstated?: string }>;
}) {
	const { locale } = await params;
	const { suspended, reinstated } = await searchParams;
	const admin = await requirePlatformAdmin();
	const t = await getTranslations({ locale, namespace: "platform" });

	const [orgRows, auditRows] = await Promise.all([
		prisma.organization.findMany({
			select: PLATFORM_ORG_LIST_SELECT,
			orderBy: { createdAt: "asc" },
			take: 200,
		}),
		prisma.auditLog.findMany({
			where: { action: { in: [...PLATFORM_AUDIT_ACTIONS] } },
			select: {
				id: true,
				action: true,
				createdAt: true,
				target: true,
				metadata: true,
				actor: { select: { name: true, email: true } },
				org: { select: { name: true, slug: true } },
			},
			orderBy: { createdAt: "desc" },
			take: 50,
		}),
	]);
	const organizations = orgRows.map(toPlatformOrgListItem);

	return (
		<div className="min-h-screen bg-ink-950">
			<header className="border-b border-ink-700 bg-ink-900/70">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
					<div className="flex items-center gap-3">
						<Logo compact />
						<span className="flex items-center gap-1.5 text-caution-300">
							<ShieldCheck className="size-4" aria-hidden="true" />
							<Badge tone="warning">{t("platformBadge")}</Badge>
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-meta text-fog-500">
							{admin.name} · {admin.email}
						</span>
						<form action={platformLogoutAction}>
							<input type="hidden" name="locale" value={locale} />
							<Button type="submit" variant="outline" size="sm">
								<LogOut className="size-4" aria-hidden="true" />
								{t("signOut")}
							</Button>
						</form>
					</div>
				</div>
			</header>

			<main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
				<PageHeader title={t("title")} subtitle={t("subtitle")} />

				{platformAdminDevelopmentMode() ? (
					<p className="mb-6 rounded-panel border border-caution-400/30 bg-caution-400/10 px-3 py-2 text-meta leading-relaxed text-caution-300">
						{t("developmentWarning")}
					</p>
				) : null}

				{suspended === "1" ? (
					<p className="mb-4 rounded-panel border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-meta text-clear-300">
						{t("suspendedNotice")}
					</p>
				) : null}
				{reinstated === "1" ? (
					<p className="mb-4 rounded-panel border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-meta text-clear-300">
						{t("reinstatedNotice")}
					</p>
				) : null}

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Building2 className="size-4 text-fog-500" aria-hidden="true" />
							{t("organizations")}
						</CardTitle>
						<CardDescription>{t("organizationsHint")}</CardDescription>
					</CardHeader>
					<CardContent>
						{organizations.length === 0 ? (
							<EmptyState title={t("organizationsEmpty")} />
						) : (
							<Table className="min-w-[920px]">
								<TableHeader>
									<TableRow>
										<TableHead>{t("organization")}</TableHead>
										<TableHead>{t("status")}</TableHead>
										<TableHead className="text-right">{t("members")}</TableHead>
										<TableHead>{t("created")}</TableHead>
										<TableHead>{t("suspendedAt")}</TableHead>
										<TableHead>{t("actions")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{organizations.map((organization) => {
										const isSuspended = organization.status === "SUSPENDED";
										return (
											<TableRow key={organization.id}>
												<TableCell>
													<span className="block font-medium text-fog-100">
														{organization.name}
													</span>
													<span className="block font-mono text-meta text-fog-500">
														{organization.slug}
													</span>
													{isSuspended && organization.suspendedReason ? (
														<span
															className="mt-1 block max-w-72 truncate text-meta text-caution-300"
															title={organization.suspendedReason}
														>
															{t("reason")}: {organization.suspendedReason}
														</span>
													) : null}
												</TableCell>
												<TableCell>
													<Badge tone={isSuspended ? "danger" : "success"}>
														{isSuspended ? t("suspended") : t("active")}
													</Badge>
												</TableCell>
												<TableCell className="text-right font-medium text-fog-100 tabular-nums">
													{organization.activeMembers}
												</TableCell>
												<TableCell className="text-meta text-fog-500">
													{formatDateTime(organization.createdAt, locale)}
												</TableCell>
												<TableCell className="text-meta text-fog-500">
													{organization.suspendedAt
														? formatDateTime(organization.suspendedAt, locale)
														: "—"}
												</TableCell>
												<TableCell>
													<OrganizationActions
														locale={locale}
														orgId={organization.id}
														orgName={organization.name}
														status={organization.status}
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

				<Card className="mt-6">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<History className="size-4 text-fog-500" aria-hidden="true" />
							{t("auditTitle")}
						</CardTitle>
						<CardDescription>{t("auditHint")}</CardDescription>
					</CardHeader>
					<CardContent>
						{auditRows.length === 0 ? (
							<EmptyState title={t("auditEmpty")} />
						) : (
							<Table className="min-w-[760px]">
								<TableHeader>
									<TableRow>
										<TableHead>{t("time")}</TableHead>
										<TableHead>{t("organization")}</TableHead>
										<TableHead>{t("action")}</TableHead>
										<TableHead>{t("actor")}</TableHead>
										<TableHead>{t("reason")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{auditRows.map((entry) => (
										<TableRow key={entry.id}>
											<TableCell className="whitespace-nowrap text-meta text-fog-500">
												{formatDateTime(entry.createdAt, locale)}
											</TableCell>
											<TableCell className="text-meta text-fog-300">
												{entry.org?.name ?? entry.target ?? "—"}
											</TableCell>
											<TableCell className="font-mono text-meta text-fog-300">
												{entry.action === PLATFORM_ORG_SUSPENDED
													? t("actionSuspended")
													: entry.action === PLATFORM_ORG_REINSTATED
														? t("actionReinstated")
														: entry.action}
											</TableCell>
											<TableCell className="text-meta text-fog-500">
												{entry.actor
													? `${entry.actor.name} · ${entry.actor.email}`
													: t("unknownActor")}
											</TableCell>
											<TableCell className="max-w-72 text-meta text-fog-500">
												{auditReason(entry.metadata) ?? "—"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
