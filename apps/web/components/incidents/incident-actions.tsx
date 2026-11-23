import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
	acknowledgeIncidentAction,
	falseAlarmAction,
	requestCancelAlertAction,
	resolveIncidentAction,
	resolveWithoutTrackerAction,
} from "@/lib/actions/incidents";
import type { PermissionSet } from "@/lib/auth/permissions";
import { type MemberRoleName, canManageIncidents } from "@/lib/auth/roles";
import { type BureauAckView, bureauAckCopyKey } from "@/lib/incidents/bureau-ack";
import {
	type CancelAlertView,
	canRequestCancelAlert,
	cancelAlertCopyKey,
} from "@/lib/incidents/cancel-alert";
import { MAX_RESOLUTION_LENGTH } from "@/lib/incidents/resolution";
import { type ImpactStatusName, isTerminal } from "@/lib/incidents/state";
import { formatDateTime } from "@/lib/utils";
import { Check, Clock, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function IncidentActions({
	incidentId,
	locale,
	status,
	role,
	permissions,
	cancelAlert,
	bureauAck,
	acknowledgementRequired,
	deviceBacked,
	resolveWithoutTrackerAvailable,
	focusCancel = false,
}: {
	incidentId: string;
	locale: string;
	status: string;
	role: MemberRoleName;
	permissions: PermissionSet;
	cancelAlert: CancelAlertView;
	bureauAck: BureauAckView;
	acknowledgementRequired: boolean;
	deviceBacked: boolean;
	resolveWithoutTrackerAvailable: boolean;
	focusCancel?: boolean;
}) {
	if (!canManageIncidents(role)) return null;
	if (isTerminal(status as ImpactStatusName)) return null;

	const t = await getTranslations({ locale, namespace: "incidents" });
	const common = await getTranslations({ locale, namespace: "common" });
	const copy = cancelAlertCopyKey(cancelAlert);
	const waiting = cancelAlert.state === "waiting";
	const canRequest = canRequestCancelAlert(status as ImpactStatusName);
	const canAcknowledgePermission = permissions["incident.acknowledge"];
	const canResolve = permissions["incident.resolve"];

	const ackCopy = bureauAckCopyKey(bureauAck);
	const ackWaiting = bureauAck.state === "waiting";
	const ackAcknowledged = bureauAck.state === "acknowledged";
	const ackFailed = bureauAck.state === "not_confirmed" || bureauAck.state === "failed";
	// A device-backed SUSPECTED incident is still in the tracker's cancel
	// window; the firmware rejects ACK_INCIDENT during Countdown. Only a local
	// incident can be acknowledged before dispatch.
	const ackNotDispatched = deviceBacked && status === "SUSPECTED";
	const canAcknowledge =
		canAcknowledgePermission &&
		(status === "CONFIRMED" || (status === "SUSPECTED" && !deviceBacked));
	// A pending command already reached the tracker; a second, contradictory
	// command is refused by the action as well.
	const showAcknowledge = canAcknowledge && !ackWaiting && !waiting;
	const acknowledgeLabel = ackFailed ? t("ackRetry") : t("acknowledge");
	const showResolveWithoutTracker = resolveWithoutTrackerAvailable && role === "ADMIN";
	const userWaitingForBureau = !canAcknowledgePermission && acknowledgementRequired;

	return (
		<div className="flex flex-col gap-3">
			{ackCopy ? (
				<div
					className={`flex items-start gap-2.5 rounded-panel border px-3 py-2.5 ${
						ackWaiting
							? "border-caution-400/30 bg-caution-400/10"
							: ackAcknowledged
								? "border-clear-400/30 bg-clear-400/10"
								: "border-alarm-500/30 bg-alarm-500/10"
					}`}
				>
					{ackWaiting ? (
						<Clock className="mt-0.5 size-4 shrink-0 text-caution-300" aria-hidden="true" />
					) : ackAcknowledged ? (
						<Check className="mt-0.5 size-4 shrink-0 text-clear-300" aria-hidden="true" />
					) : (
						<TriangleAlert className="mt-0.5 size-4 shrink-0 text-alarm-300" aria-hidden="true" />
					)}
					<div>
						<p
							className={`text-body font-medium ${
								ackWaiting
									? "text-caution-300"
									: ackAcknowledged
										? "text-clear-300"
										: "text-alarm-300"
							}`}
						>
							{t(ackCopy.title)}
						</p>
						<p className="mt-1 text-meta leading-relaxed text-fog-300">{t(ackCopy.body)}</p>
						{ackWaiting ? (
							<p className="mt-1 text-meta text-fog-400">{t("ackWaitingBlocksActions")}</p>
						) : null}
						{(ackWaiting || ackFailed) && bureauAck.requestedAt ? (
							<p className="mt-1 text-meta text-fog-500">
								{formatDateTime(bureauAck.requestedAt, locale)}
							</p>
						) : null}
					</div>
				</div>
			) : null}

			{ackNotDispatched ? (
				<div className="rounded-panel border border-caution-400/30 bg-caution-400/10 px-3 py-2.5">
					<p className="text-body font-medium text-caution-300">{t("ackNotDispatchedTitle")}</p>
					<p className="mt-1 text-meta leading-relaxed text-fog-300">{t("ackNotDispatchedBody")}</p>
				</div>
			) : null}

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
						{waiting ? (
							<p className="mt-1 text-meta text-fog-400">{t("cancelWaitingBlocksAck")}</p>
						) : null}
						{waiting && cancelAlert.requestedAt ? (
							<p className="mt-1 text-meta text-fog-500">
								{formatDateTime(cancelAlert.requestedAt, locale)}
							</p>
						) : null}
					</div>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				{showAcknowledge ? (
					<form action={acknowledgeIncidentAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="incidentId" value={incidentId} />
						<Button type="submit" size="sm" variant="secondary">
							{acknowledgeLabel}
						</Button>
					</form>
				) : null}

				{canResolve && !waiting && !ackWaiting ? (
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

				{canResolve && !waiting && !ackWaiting && canRequest ? (
					<form action={requestCancelAlertAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="incidentId" value={incidentId} />
						<input type="hidden" name="intent" value="cancel" />
						<ConfirmSubmit
							message={t("confirmCancel")}
							confirmLabel={t("cancel")}
							cancelLabel={common("cancel")}
							variant="ghost"
							autoFocus={focusCancel}
						>
							{t("cancel")}
						</ConfirmSubmit>
					</form>
				) : null}
			</div>

			{acknowledgementRequired ? (
				<div className="rounded-panel border border-caution-400/30 bg-caution-400/10 px-3 py-2.5">
					<p className="text-body font-medium text-caution-300">
						{userWaitingForBureau ? t("ackWaitingForBureauTitle") : t("ackRequiredTitle")}
					</p>
					<p className="mt-1 text-meta leading-relaxed text-fog-300">
						{userWaitingForBureau ? t("ackWaitingForBureauBody") : t("ackRequiredBody")}
					</p>
				</div>
			) : canResolve ? (
				<form action={resolveIncidentAction} className="flex flex-wrap items-center gap-2">
					<input type="hidden" name="locale" value={locale} />
					<input type="hidden" name="incidentId" value={incidentId} />
					<Input
						name="resolution"
						placeholder="Resolution note (optional)"
						maxLength={MAX_RESOLUTION_LENGTH}
						className="h-9 max-w-xs"
					/>
					<Button type="submit" size="sm">
						{t("resolve")}
					</Button>
				</form>
			) : null}

			{showResolveWithoutTracker ? (
				<form
					action={resolveWithoutTrackerAction}
					className="flex flex-col gap-2 rounded-panel border border-alarm-500/30 bg-alarm-500/10 p-3"
				>
					<input type="hidden" name="locale" value={locale} />
					<input type="hidden" name="incidentId" value={incidentId} />
					<div>
						<p className="text-body font-medium text-alarm-300">{t("resolveUnconfirmedTitle")}</p>
						<p className="mt-1 text-meta leading-relaxed text-fog-300">
							{t("resolveUnconfirmedBody")}
						</p>
					</div>
					<Input
						name="resolution"
						placeholder={t("resolveUnconfirmedNote")}
						maxLength={MAX_RESOLUTION_LENGTH}
						className="h-9 max-w-sm"
					/>
					<label
						htmlFor={`resolve-confirm-${incidentId}`}
						className="flex max-w-sm flex-col gap-1 text-meta text-fog-300"
					>
						<span>{t("resolveUnconfirmedConfirmLabel")}</span>
						<Input
							id={`resolve-confirm-${incidentId}`}
							name="confirm"
							placeholder="RESOLVE"
							autoComplete="off"
							spellCheck={false}
							required
							className="h-9 font-mono"
						/>
					</label>
					<p className="text-meta leading-relaxed text-fog-400">
						{t("resolveUnconfirmedConfirmHelp")}
					</p>
					<Button type="submit" size="sm" variant="danger" className="self-start">
						{t("resolveUnconfirmedAction")}
					</Button>
				</form>
			) : null}
		</div>
	);
}
