import { AlertStatusBadge } from "@/components/notifications/alert-status-badge";
import { Link } from "@/i18n/routing";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { AlertChannel, AlertStatus } from "@prisma/client";
import { getTranslations } from "next-intl/server";

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

export interface NotificationLogCardItem {
	id: string;
	channel: AlertChannel;
	target: string;
	status: AlertStatus;
	attempts: number;
	error: string | null;
	createdAt: Date;
	impact: {
		id: string;
		vehicle: { plateNo: string };
	};
}

export async function NotificationLogCardList({
	locale,
	rows,
}: {
	locale: string;
	rows: readonly NotificationLogCardItem[];
}) {
	const t = await getTranslations({ locale, namespace: "notifications" });

	return (
		<ul className="flex flex-col divide-y divide-ink-700/70">
			{rows.map((row) => {
				const failed = row.status === "FAILED" && row.error;

				return (
					<li key={row.id} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div className="min-w-0">
								<p className="text-meta text-fog-500">{t("time")}</p>
								<p className="mt-0.5 font-medium text-emphasis text-fog-100">
									{formatDateTime(row.createdAt, locale)}
								</p>
								<p className="mt-0.5 text-meta text-fog-500">{formatRelative(row.createdAt)}</p>
							</div>
							<AlertStatusBadge status={row.status} label={t(STATUS_LABELS[row.status])} />
						</div>

						<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-meta">
							<div className="min-w-0">
								<dt className="text-fog-500">{t("incident")}</dt>
								<dd className="mt-0.5">
									<Link
										href={`/incidents/${row.impact.id}`}
										aria-label={t("openIncident", { plate: row.impact.vehicle.plateNo })}
										className="inline-flex min-h-11 items-center font-medium text-fog-100 hover:text-signal-300 hover:underline"
									>
										{row.impact.vehicle.plateNo}
									</Link>
									<span className="block break-all font-mono text-meta text-fog-500">
										{row.impact.id}
									</span>
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("channel")}</dt>
								<dd className="mt-0.5 text-fog-300">{t(CHANNEL_LABELS[row.channel])}</dd>
							</div>
							<div className="col-span-2 min-w-0">
								<dt className="text-fog-500">{t("target")}</dt>
								<dd className="mt-0.5 break-all font-mono text-fog-300">
									{row.target}
									{failed ? (
										<span className="mt-1 block break-all text-meta text-alarm-300">
											{row.error}
										</span>
									) : null}
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("attempts")}</dt>
								<dd className="mt-0.5 tabular-nums text-fog-300">{row.attempts}</dd>
							</div>
						</dl>
					</li>
				);
			})}
		</ul>
	);
}
