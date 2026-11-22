import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Link } from "@/i18n/routing";
import { type IncidentsQuery, hasActiveFilters } from "@/lib/incidents/query";
import { getTranslations } from "next-intl/server";

export async function IncidentsToolbar({
	locale,
	query,
	total,
}: {
	locale: string;
	query: IncidentsQuery;
	total: number;
}) {
	const t = await getTranslations({ locale, namespace: "incidents" });

	return (
		<form method="get" action={`/${locale}/incidents`} className="mb-4 flex flex-col gap-3">
			{query.status ? <input type="hidden" name="status" value={query.status} /> : null}
			{query.sort !== "detected" ? <input type="hidden" name="sort" value={query.sort} /> : null}
			{query.dir !== "desc" ? <input type="hidden" name="dir" value={query.dir} /> : null}

			<div className="flex flex-wrap items-end gap-3">
				<div className="flex w-full flex-col gap-1.5 sm:w-72">
					<Label htmlFor="incidents-search">{t("searchLabel")}</Label>
					<Input
						id="incidents-search"
						name="q"
						type="search"
						defaultValue={query.q}
						maxLength={80}
						placeholder={t("searchPlaceholder")}
					/>
				</div>

				<div className="flex w-full flex-col gap-1.5 sm:w-40">
					<Label htmlFor="incidents-severity">{t("severity")}</Label>
					<Select id="incidents-severity" name="severity" defaultValue={query.severity ?? ""}>
						<option value="">{t("anySeverity")}</option>
						<option value="critical">{t("severityCritical")}</option>
						<option value="high">{t("severityHigh")}</option>
						<option value="moderate">{t("severityModerate")}</option>
						<option value="low">{t("severityLow")}</option>
					</Select>
				</div>

				<div className="flex w-full flex-col gap-1.5 sm:w-40">
					<Label htmlFor="incidents-range">{t("dateRange")}</Label>
					<Select id="incidents-range" name="range" defaultValue={query.range}>
						<option value="all">{t("rangeAll")}</option>
						<option value="7">{t("range7")}</option>
						<option value="14">{t("range14")}</option>
						<option value="30">{t("range30")}</option>
					</Select>
				</div>

				<Button type="submit" size="sm" variant="outline">
					{t("apply")}
				</Button>

				<p className="text-meta text-fog-500 sm:ml-auto sm:self-center">
					{t("resultCount", { count: total })}
				</p>
			</div>

			{hasActiveFilters(query) ? (
				<Link href="/incidents" className="w-fit text-meta text-fog-300 hover:text-signal-300">
					{t("clearFilters")}
				</Link>
			) : null}
		</form>
	);
}
