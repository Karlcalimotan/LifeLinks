import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { VehicleStatusBadge } from "@/components/domain/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setMaintenanceModeAction } from "@/lib/actions/vehicles";
import { maintenanceActionFor } from "@/lib/vehicles/detail";
import { getTranslations } from "next-intl/server";

export async function MaintenanceControl({
	locale,
	vehicleId,
	plateNo,
	status,
	editable,
}: {
	locale: string;
	vehicleId: string;
	plateNo: string;
	status: string;
	editable: boolean;
}) {
	const t = await getTranslations({ locale, namespace: "vehicles" });
	const action = maintenanceActionFor(status);
	const label = action === "enable" ? t("maintenanceEnable") : t("maintenanceDisable");
	const message =
		action === "enable"
			? t("maintenanceConfirmEnable", { plate: plateNo })
			: t("maintenanceConfirmDisable", { plate: plateNo });
	const statusNote =
		status === "MAINTENANCE"
			? t("maintenanceWorkshopNote")
			: status === "ACTIVE"
				? t("maintenanceActiveNote")
				: null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("maintenanceTitle")}</CardTitle>
				<CardDescription>{t("maintenanceDescription")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<span className="text-meta text-fog-500">{t("maintenanceCurrent")}</span>
					<VehicleStatusBadge status={status} />
					{statusNote ? <span className="text-meta text-fog-400">{statusNote}</span> : null}
				</div>

				{action ? (
					editable ? (
						<div className="flex flex-col gap-2 border-t border-ink-700 pt-4">
							<form action={setMaintenanceModeAction} className="flex flex-wrap items-center gap-3">
								<input type="hidden" name="locale" value={locale} />
								<input type="hidden" name="vehicleId" value={vehicleId} />
								<input type="hidden" name="action" value={action} />
								<ConfirmSubmit message={message} confirmLabel={label}>
									{label}
								</ConfirmSubmit>
							</form>
							<p className="text-meta text-fog-500">{t("maintenanceAudited")}</p>
						</div>
					) : (
						<p className="rounded-control border border-ink-700 bg-ink-900/50 px-3 py-2 text-meta text-fog-400">
							{t("maintenanceAdminOnly")}
						</p>
					)
				) : (
					<p className="rounded-control border border-ink-700 bg-ink-900/50 px-3 py-2 text-meta text-fog-400">
						{t("maintenanceRetired")}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
