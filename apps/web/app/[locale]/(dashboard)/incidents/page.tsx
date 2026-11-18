import { IncidentStatusBadge, SeverityBadge } from "@/components/domain/badges";
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
import { requireUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import type { ImpactStatus } from "@prisma/client";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const FILTERS = [
	"ALL",
	"SUSPECTED",
	"CONFIRMED",
	"ACKNOWLEDGED",
	"RESOLVED",
	"CANCELLED",
	"FALSE_ALARM",
] as const;

export default async function IncidentsPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ status?: string }>;
}) {
	const { locale } = await params;
	const { status } = await searchParams;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "incidents" });

	const filter = FILTERS.includes(status as (typeof FILTERS)[number])
		? (status as (typeof FILTERS)[number])
		: "ALL";

	function filterLabel(value: string): string {
		if (value === "ALL") return "All";
		const words = value.replaceAll("_", " ").toLowerCase();
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

	const ownership =
		current.role === "USER" ? { vehicle: { is: { ownerId: current.user.id } } } : {};
	const incidents = await prisma.impactEvent.findMany({
		where: {
			orgId: current.org.id,
			...ownership,
			...(filter === "ALL" ? {} : { status: filter as ImpactStatus }),
		},
		orderBy: { detectedAt: "desc" },
		take: 100,
		include: { vehicle: true, alerts: true },
	});

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			<div className="mb-4 flex flex-wrap gap-2">
				{FILTERS.map((entry) => (
					<Link
						key={entry}
						href={entry === "ALL" ? "/incidents" : `/incidents?status=${entry}`}
						className={`rounded-[3px] border px-3 py-1 text-[11px] transition-colors ${
							filter === entry
								? "border-signal-500/40 bg-signal-500/10 text-signal-300"
								: "border-ink-700 text-fog-500 hover:border-ink-600 hover:text-fog-300"
						}`}
					>
						{filterLabel(entry)}
					</Link>
				))}
			</div>

			<Card>
				<CardContent className="pt-5">
					{incidents.length === 0 ? (
						<EmptyState title={t("empty")} />
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("detected")}</TableHead>
									<TableHead>{t("vehicle")}</TableHead>
									<TableHead>{t("severity")}</TableHead>
									<TableHead>{t("status")}</TableHead>
									<TableHead>Location</TableHead>
									<TableHead>{t("alerts")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{incidents.map((incident) => (
									<TableRow key={incident.id}>
										<TableCell>
											<Link
												href={`/incidents/${incident.id}`}
												className="font-medium text-signal-400 hover:text-signal-300"
											>
												{formatDateTime(incident.detectedAt, locale)}
											</Link>
										</TableCell>
										<TableCell className="text-fog-100">{incident.vehicle.plateNo}</TableCell>
										<TableCell>
											<SeverityBadge peakAccelG={incident.peakAccelG} tiltDeg={incident.tiltDeg} />
										</TableCell>
										<TableCell>
											<IncidentStatusBadge status={incident.status} />
										</TableCell>
										<TableCell className="text-xs text-fog-500">
											{incident.lat != null && incident.lng != null
												? `${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)}`
												: "—"}
										</TableCell>
										<TableCell className="text-xs text-fog-500">{incident.alerts.length}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</>
	);
}
