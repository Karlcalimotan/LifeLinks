import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import { Link } from "@/i18n/routing";
import { type NotificationsQuery, hasActiveFilters } from "@/lib/notifications/query";
import { getTranslations } from "next-intl/server";

export async function NotificationsToolbar({
	locale,
	query,
	total,
}: {
	locale: string;
	query: NotificationsQuery;
	total: number;
}) {
	const t = await getTranslations({ locale, namespace: "notifications" });

	return (
		<form method="get" action={`/${locale}/notifications`} className="mb-4 flex flex-col gap-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
				<div className="grid grid-cols-2 gap-3 sm:contents">
					<div className="flex min-w-0 flex-col gap-1.5 sm:w-44">
						<Label className="sr-only sm:not-sr-only" htmlFor="notifications-status">
							{t("status")}
						</Label>
						<Select id="notifications-status" name="status" defaultValue={query.status ?? ""}>
							<option value="">{t("anyStatus")}</option>
							<option value="QUEUED">{t("statusQueued")}</option>
							<option value="SENT">{t("statusSent")}</option>
							<option value="FAILED">{t("statusFailed")}</option>
							<option value="ACKNOWLEDGED">{t("statusAcknowledged")}</option>
						</Select>
					</div>

					<div className="flex min-w-0 flex-col gap-1.5 sm:w-44">
						<Label className="sr-only sm:not-sr-only" htmlFor="notifications-channel">
							{t("channel")}
						</Label>
						<Select id="notifications-channel" name="channel" defaultValue={query.channel ?? ""}>
							<option value="">{t("anyChannel")}</option>
							<option value="SMS">{t("channelSms")}</option>
							<option value="EMAIL">{t("channelEmail")}</option>
							<option value="HTTP">{t("channelHttp")}</option>
						</Select>
					</div>
				</div>

				<Button type="submit" size="sm" variant="outline" className="h-11 w-full sm:h-8 sm:w-auto">
					{t("filterApply")}
				</Button>

				<p className="text-meta text-fog-500 sm:ml-auto sm:self-center">
					{t("resultCount", { count: total })}
				</p>
			</div>

			{hasActiveFilters(query) ? (
				<Link
					href="/notifications"
					className="inline-flex h-10 w-fit items-center text-meta text-fog-300 hover:text-signal-300 sm:h-auto"
				>
					{t("clearFilters")}
				</Link>
			) : null}
		</form>
	);
}
