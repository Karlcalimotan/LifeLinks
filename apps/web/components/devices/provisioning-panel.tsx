import { CopyMac } from "@/components/devices/copy-mac";
import { RotateTokenButton } from "@/components/devices/rotate-token-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	PROVISIONING_AP_ADDRESS,
	provisioningApName,
	provisioningState,
} from "@/lib/device/provisioning";
import { formatDateTime } from "@/lib/utils";
import { Factory, RotateCcw } from "lucide-react";
import { getTranslations } from "next-intl/server";

export interface ProvisioningPanelProps {
	deviceId: string;
	label: string;
	mac: string;
	lastSeenAt: Date | string | null;
	locale: string;
}

/**
 * Installer-facing WiFi setup. The panel only prepares the installer: the
 * tracker's own portal collects the WiFi password, and that password never
 * reaches this server.
 */
export async function ProvisioningPanel({
	deviceId,
	label,
	mac,
	lastSeenAt,
	locale,
}: ProvisioningPanelProps) {
	const t = await getTranslations({ locale, namespace: "devices.provisioning" });
	const apName = provisioningApName(mac);
	const state = provisioningState(lastSeenAt);
	const configured = state === "configured";

	const steps = [
		{ title: t("step1Title"), body: t("step1Body") },
		{ title: t("step2Title"), body: t("step2Body", { apName }) },
		{ title: t("step3Title"), body: t("step3Body") },
		{ title: t("step4Title"), body: t("step4Body") },
		{ title: t("step5Title"), body: t("step5Body") },
	];

	return (
		<Card className="mb-6">
			<CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
				<div>
					<CardTitle>{t("title")}</CardTitle>
					<CardDescription>{t("description")}</CardDescription>
				</div>
				<Badge tone={configured ? "success" : "warning"}>
					{configured ? t("stateConfigured") : t("stateNeedsSetup")}
				</Badge>
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				<div className="grid gap-3 sm:grid-cols-3">
					<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
						<p className="text-meta font-medium text-fog-500">{t("setupNetwork")}</p>
						<code className="mt-1 block break-all font-mono text-body text-fog-100">{apName}</code>
						<p className="mt-1 text-meta text-fog-500">{t("setupNetworkHint")}</p>
					</div>
					<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
						<p className="text-meta font-medium text-fog-500">{t("deviceId")}</p>
						<div className="mt-1">
							<CopyMac value={mac} />
						</div>
						<p className="mt-1 text-meta text-fog-500">{t("deviceIdHint")}</p>
					</div>
					<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
						<p className="text-meta font-medium text-fog-500">{t("setupAddress")}</p>
						<code className="mt-1 block font-mono text-body text-fog-100">
							{PROVISIONING_AP_ADDRESS}
						</code>
						<p className="mt-1 text-meta text-fog-500">{t("setupAddressHint")}</p>
					</div>
				</div>

				<p className="text-meta text-fog-500">
					{lastSeenAt
						? t("lastSeen", { time: formatDateTime(lastSeenAt, locale) })
						: t("neverSeen")}{" "}
					{t("stateNote")}
				</p>

				<div className="rounded border border-ink-700 bg-ink-950/40 p-4">
					<h3 className="font-display text-emphasis font-semibold text-fog-100">
						{t("tokenTitle")}
					</h3>
					<p className="mt-1 text-meta leading-relaxed text-fog-500">{t("tokenBody")}</p>
					<div className="mt-3">
						<RotateTokenButton deviceId={deviceId} label={label} locale={locale} />
					</div>
				</div>

				<div>
					<h3 className="font-display text-emphasis font-semibold text-fog-100">
						{t("stepsTitle")}
					</h3>
					<ol className="mt-3 flex flex-col gap-3">
						{steps.map((step, index) => (
							<li key={step.title} className="flex gap-3">
								<span
									className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-control border border-ink-600 bg-ink-700 font-display text-meta font-semibold text-fog-100"
									aria-hidden="true"
								>
									{index + 1}
								</span>
								<div className="min-w-0">
									<p className="text-body font-medium text-fog-100">{step.title}</p>
									<p className="text-meta leading-relaxed text-fog-500">{step.body}</p>
								</div>
							</li>
						))}
					</ol>
				</div>

				<div>
					<h3 className="font-display text-emphasis font-semibold text-fog-100">
						{t("resetTitle")}
					</h3>
					<p className="mt-1 text-meta leading-relaxed text-fog-500">{t("resetIntro")}</p>
					<div className="mt-3 grid gap-3 sm:grid-cols-2">
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="flex items-center gap-2 text-body font-medium text-fog-100">
								<RotateCcw className="size-4 text-fog-500" aria-hidden="true" />
								{t("wifiResetTitle")}
							</p>
							<p className="mt-1 text-meta leading-relaxed text-fog-500">{t("wifiResetBody")}</p>
						</div>
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="flex items-center gap-2 text-body font-medium text-fog-100">
								<Factory className="size-4 text-fog-500" aria-hidden="true" />
								{t("factoryResetTitle")}
							</p>
							<p className="mt-1 text-meta leading-relaxed text-fog-500">{t("factoryResetBody")}</p>
						</div>
					</div>
					<p className="mt-2 text-meta text-fog-500">{t("resetCancelNote")}</p>
				</div>

				<div className="rounded border border-ink-700 bg-ink-900/60 p-3">
					<p className="text-body font-medium text-fog-100">{t("credentialsNoteTitle")}</p>
					<p className="mt-1 text-meta leading-relaxed text-fog-500">{t("credentialsNote")}</p>
				</div>
				<p className="text-meta text-fog-500">{t("portalNote")}</p>
			</CardContent>
		</Card>
	);
}
