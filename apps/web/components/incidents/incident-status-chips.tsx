import { Link } from "@/i18n/routing";
import {
	INCIDENT_STATUS_FILTERS,
	type IncidentStatusFilter,
	type IncidentsQuery,
	buildIncidentsHref,
} from "@/lib/incidents/query";
import { getTranslations } from "next-intl/server";

const STATUS_LABELS: Record<IncidentStatusFilter, string> = {
	SUSPECTED: "statusSuspected",
	CONFIRMED: "statusConfirmed",
	ACKNOWLEDGED: "statusAcknowledged",
	RESOLVED: "statusResolved",
	CANCELLED: "statusCancelled",
	FALSE_ALARM: "statusFalseAlarm",
};

export async function IncidentStatusChips({
	locale,
	query,
	counts,
	allCount,
}: {
	locale: string;
	query: IncidentsQuery;
	counts: Record<string, number>;
	allCount: number;
}) {
	const t = await getTranslations({ locale, namespace: "incidents" });
	const chips: Array<{ value: IncidentStatusFilter | null; label: string; count: number }> = [
		{ value: null, label: t("statusAll"), count: allCount },
		...INCIDENT_STATUS_FILTERS.map((value) => ({
			value,
			label: t(STATUS_LABELS[value]),
			count: counts[value] ?? 0,
		})),
	];

	return (
		<nav aria-label={t("statusFilter")} className="mb-4 flex flex-wrap gap-2">
			{chips.map((chip) => {
				const active = query.status === chip.value;
				return (
					<Link
						key={chip.value ?? "all"}
						href={buildIncidentsHref(query, { status: chip.value, page: 1 })}
						aria-current={active ? "true" : undefined}
						className={`inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-meta transition-colors ${
							active
								? "border-signal-500/40 bg-signal-500/10 text-signal-300"
								: "border-ink-700 text-fog-400 hover:border-ink-600 hover:text-fog-100"
						}`}
					>
						{chip.label}
						<span className={`tabular-nums ${active ? "text-signal-300" : "text-fog-500"}`}>
							{chip.count}
						</span>
					</Link>
				);
			})}
		</nav>
	);
}
