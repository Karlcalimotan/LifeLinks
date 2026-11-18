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

export function IncidentActions({
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

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-2">
				{status === "CONFIRMED" || status === "SUSPECTED" ? (
					<form action={acknowledgeIncidentAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="incidentId" value={incidentId} />
						<Button type="submit" size="sm" variant="secondary">
							Acknowledge
						</Button>
					</form>
				) : null}

				<form action={falseAlarmAction}>
					<input type="hidden" name="locale" value={locale} />
					<input type="hidden" name="incidentId" value={incidentId} />
					<Button type="submit" size="sm" variant="outline">
						False alarm
					</Button>
				</form>

				{status !== "CANCELLED" ? (
					<form action={cancelIncidentAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="incidentId" value={incidentId} />
						<Button type="submit" size="sm" variant="ghost">
							Cancel
						</Button>
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
					Resolve
				</Button>
			</form>
		</div>
	);
}
