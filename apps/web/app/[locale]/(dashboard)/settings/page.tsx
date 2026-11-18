import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { updateSettingsAction } from "@/lib/actions/settings";
import { canAdminister, requireRole } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { getOrgSettings } from "@/lib/settings/org";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ saved?: string; error?: string }>;
}) {
	const { locale } = await params;
	const { saved, error } = await searchParams;
	const current = await requireRole("ADMIN");
	const t = await getTranslations({ locale, namespace: "settings" });

	const [org, settings] = await Promise.all([
		prisma.organization.findUnique({ where: { id: current.org.id } }),
		getOrgSettings(current.org.id),
	]);
	const editable = canAdminister(current.role);

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			{saved ? (
				<p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
					{t("saved")}
				</p>
			) : null}
			{error ? (
				<p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
					{error === "forbidden"
						? t("adminOnly")
						: "Check the values and try again. Thresholds must stay inside the safety envelope."}
				</p>
			) : null}

			<form action={updateSettingsAction} className="grid gap-6 xl:grid-cols-2">
				<input type="hidden" name="locale" value={locale} />

				<Card>
					<CardHeader>
						<CardTitle>{t("organization")}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<Field>
							<Label htmlFor="orgName">{t("orgName")}</Label>
							<Input
								id="orgName"
								name="orgName"
								defaultValue={org?.name ?? current.org.name}
								disabled={!editable}
								required
							/>
						</Field>
						<Field>
							<Label htmlFor="phones">{t("phones")}</Label>
							<Textarea
								id="phones"
								name="phones"
								defaultValue={settings.alertPhones.join("\n")}
								placeholder={"+639171234567\n+639181234567"}
								disabled={!editable}
							/>
							<p className="text-[11px] text-slate-500">{t("phonesHint")}</p>
						</Field>
						<Field>
							<Label htmlFor="emails">{t("emails")}</Label>
							<Textarea
								id="emails"
								name="emails"
								defaultValue={settings.alertEmails.join("\n")}
								placeholder={"ops@example.com"}
								disabled={!editable}
							/>
							<p className="text-[11px] text-slate-500">{t("emailsHint")}</p>
						</Field>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("thresholds")}</CardTitle>
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-3">
						<Field>
							<Label htmlFor="impactThresholdG">{t("impactThreshold")}</Label>
							<Input
								id="impactThresholdG"
								name="impactThresholdG"
								type="number"
								min={1.5}
								max={5}
								step={0.1}
								defaultValue={settings.impactThresholdG}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="tiltThresholdDeg">{t("tiltThreshold")}</Label>
							<Input
								id="tiltThresholdDeg"
								name="tiltThresholdDeg"
								type="number"
								min={30}
								max={90}
								step={1}
								defaultValue={settings.tiltThresholdDeg}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="confirmWindowMs">Confirm window (ms)</Label>
							<Input
								id="confirmWindowMs"
								name="confirmWindowMs"
								type="number"
								min={100}
								max={2000}
								step={10}
								defaultValue={settings.confirmWindowMs}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="cancelWindowS">{t("cancelWindow")}</Label>
							<Input
								id="cancelWindowS"
								name="cancelWindowS"
								type="number"
								min={5}
								max={60}
								step={1}
								defaultValue={settings.cancelWindowS}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="heartbeatIntervalS">{t("heartbeatInterval")}</Label>
							<Input
								id="heartbeatIntervalS"
								name="heartbeatIntervalS"
								type="number"
								min={10}
								max={300}
								step={1}
								defaultValue={settings.heartbeatIntervalS}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="sosRetryS">{t("sosRetry")}</Label>
							<Input
								id="sosRetryS"
								name="sosRetryS"
								type="number"
								min={30}
								max={300}
								step={1}
								defaultValue={settings.sosRetryS}
								disabled={!editable}
							/>
						</Field>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("retention")}</CardTitle>
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-3">
						<Field>
							<Label htmlFor="telemetryRetentionDays">{t("telemetryRetention")}</Label>
							<Input
								id="telemetryRetentionDays"
								name="telemetryRetentionDays"
								type="number"
								min={1}
								max={3650}
								defaultValue={settings.telemetryRetentionDays}
								disabled={!editable}
							/>
						</Field>
						<Field>
							<Label htmlFor="incidentRetentionDays">{t("incidentRetention")}</Label>
							<Input
								id="incidentRetentionDays"
								name="incidentRetentionDays"
								type="number"
								min={1}
								max={3650}
								defaultValue={settings.incidentRetentionDays}
								disabled={!editable}
							/>
						</Field>
						<label className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
							<input
								type="checkbox"
								name="parkedImpactAlerts"
								defaultChecked={settings.parkedImpactAlerts}
								disabled={!editable}
								className="size-4 rounded border-slate-700 bg-slate-950"
							/>
							{t("parkedImpactAlerts")}
						</label>
					</CardContent>
				</Card>

				<Card className="flex flex-col justify-between">
					<CardContent className="pt-5">
						<p className="text-xs leading-relaxed text-slate-400">
							Thresholds are bounded by the firmware safety envelope. The device rejects the whole
							config object if a single field is outside its range, so a bad save can never
							half-apply.
						</p>
						{!editable ? (
							<p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
								{t("adminOnly")}
							</p>
						) : null}
					</CardContent>
					<div className="border-t border-slate-800/70 p-5">
						<Button type="submit" disabled={!editable}>
							{t("saveSettings")}
						</Button>
					</div>
				</Card>
			</form>
		</>
	);
}
