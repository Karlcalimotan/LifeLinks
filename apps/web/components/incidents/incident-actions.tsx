import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
	acknowledgeIncidentAction,
	falseAlarmAction,
	requestCancelAlertAction,
	resolveIncidentAction,
} from "@/lib/actions/incidents";
import { type MemberRoleName, canManageIncidents } from "@/lib/auth/roles";
import {
	type CancelAlertView,
	canRequestCancelAlert,
	cancelAlertCopyKey,
} from "@/lib/incidents/cancel-alert";
import { type ImpactStatusName, isTerminal } from "@/lib/incidents/state";
import { formatDateTime } from "@/lib/utils";
import { Clock, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function IncidentActions({
	incidentId,
	locale,
	status,
	role,
	cancelAlert,
}: {
	incidentId: string;
	locale: string;
	status: string;
	role: MemberRoleName;
	cancelAlert: CancelAlertView;
}) {
	if (!canManageIncidents(role)) return null;
	if (isTerminal(status as ImpactStatusName)) return null;

	const t = await getTranslations({ locale, namespace: "incidents" });
	const common = await getTranslations({ locale, namespace: "common" });
	const copy = cancelAlertCopyKey(cancelAlert);
	const waiting = cancelAlert.state === "waiting";
	const canRequest = canRequestCancelAlert(status as ImpactStatusName);

	return (
		<div className="flex flex-col gap-3">
			{copy ? (
				<div
					className={`flex items-start gap-2.5 rounded-panel border px-3 py-2.5 ${
						waiting
							? "border-caution-400/30 bg-caution-400/10"
							: "border-alarm-500/30 bg-alarm-500/10"
					}`}
				>
					{waiting ? (
						<Clock className="mt-0.5 size-4 shrink-0 text-caution-300" aria-hidden="true" />
					) : (
						<TriangleAlert className="mt-0.5 size-4 shrink-0 text-alarm-300" aria-hidden="true" />
					)}
					<div>
						<p
							className={`text-body font-medium ${waiting ? "text-caution-300" : "text-alarm-300"}`}
						>
							{t(copy.title)}
						</p>
						<p className="mt-1 text-meta leading-relaxed text-fog-300">{t(copy.body)}</p>
						{waiting && cancelAlert.requestedAt ? (
							<p className="mt-1 text-meta text-fog-500">
								{formatDateTime(cancelAlert.requestedAt, locale)}
							</p>
						) : null}
					</div>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				{status === "CONFIRMED" || status === "SUSPECTED" ? (
					<form action={acknowledgeIncidentAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="incidentId" value={incidentId} />
						<Button type="submit" size="sm" variant="secondary">
							{t("acknowledge")}
						</Button>
					</form>
				) : null}

				{!waiting ? (
					canRequest ? (
						<form action={requestCancelAlertAction}>
							<input type="hidden" name="locale" value={locale} />
							<input type="hidden" name="incidentId" value={incidentId} />
							<input type="hidden" name="intent" value="false_alarm" />
							<ConfirmSubmit
								message={t("confirmFalseAlarm")}
								confirmLabel={t("falseAlarm")}
								cancelLabel={common("cancel")}
								variant="outline"
							>
								{t("falseAlarm")}
							</ConfirmSubmit>
						</form>
					) : (
						<form action={falseAlarmAction}>
							<input type="hidden" name="locale" value={locale} />
							<input type="hidden" name="incidentId" value={incidentId} />
							<ConfirmSubmit
								message={t("confirmFalseAlarmLocal")}
								confirmLabel={t("falseAlarm")}
								cancelLabel={common("cancel")}
								variant="outline"
							>
								{t("falseAlarm")}
							</ConfirmSubmit>
						</form>
					)
				) : null}

				{!waiting && canRequest ? (
					<form action={requestCancelAlertAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="incidentId" value={incidentId} />
						<input type="hidden" name="intent" value="cancel" />
						<ConfirmSubmit
							message={t("confirmCancel")}
							confirmLabel={t("cancel")}
							cancelLabel={common("cancel")}
							variant="ghost"
						>
							{t("cancel")}
						</ConfirmSubmit>
					</form>
				) : null}
			</div>

			<form action={resolveIncidentAction} className="flex flex-wrap items-center gap-2">
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="incidentId" value={incidentId} />
				<Input
					name="resolution"
					placeholder="Resolution note (optional)"
					className="h-9 max-w-xs"
				/>
				<Button type="submit" size="sm">
					{t("resolve")}
				</Button>
			</form>
		</div>
	);
}
