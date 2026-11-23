import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
	acknowledgeIncidentAction,
	cancelIncidentAction,
	falseAlarmAction,
	resolveIncidentAction,
} from "@/lib/actions/incidents";
import { type MemberRoleName, canManageIncidents } from "@/lib/auth/roles";
import { type ImpactStatusName, isTerminal } from "@/lib/incidents/state";
import { getTranslations } from "next-intl/server";

export async function IncidentActions({
	incidentId,
	locale,
	status,
	role,
}: {
	incidentId: string;
	locale: string;
	status: string;
	role: MemberRoleName;
}) {
	if (!canManageIncidents(role)) return null;
	if (isTerminal(status as ImpactStatusName)) return null;

	const t = await getTranslations({ locale, namespace: "incidents" });
	const common = await getTranslations({ locale, namespace: "common" });

	return (
		<div className="flex flex-col gap-3">
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

				<form action={falseAlarmAction}>
					<input type="hidden" name="locale" value={locale} />
					<input type="hidden" name="incidentId" value={incidentId} />
					<ConfirmSubmit
						message={t("confirmFalseAlarm")}
						confirmLabel={t("falseAlarm")}
						cancelLabel={common("cancel")}
						variant="outline"
					>
						{t("falseAlarm")}
					</ConfirmSubmit>
				</form>

				{status !== "CANCELLED" ? (
					<form action={cancelIncidentAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="incidentId" value={incidentId} />
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
