import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { archiveVehicleAction } from "@/lib/actions/vehicles";
import { getTranslations } from "next-intl/server";

/**
 * The console never hard-deletes a vehicle: a row with incidents or a tracker
 * must keep its history, so removal is the RETIRED archive. A retired vehicle
 * offers no further archive action.
 */
export async function ArchiveVehicle({
	locale,
	vehicleId,
	plateNo,
	status,
}: {
	locale: string;
	vehicleId: string;
	plateNo: string;
	status: string;
}) {
	const t = await getTranslations({ locale, namespace: "vehicles" });
	if (status === "RETIRED") return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("archiveVehicle")}</CardTitle>
				<CardDescription>{t("archiveVehicleConfirm", { plate: plateNo })}</CardDescription>
			</CardHeader>
			<CardContent>
				<form action={archiveVehicleAction}>
					<input type="hidden" name="locale" value={locale} />
					<input type="hidden" name="vehicleId" value={vehicleId} />
					<ConfirmSubmit
						message={t("archiveVehicleConfirm", { plate: plateNo })}
						confirmLabel={t("archiveVehicle")}
						cancelLabel={t("cancel")}
						variant="danger"
					>
						{t("archiveVehicle")}
					</ConfirmSubmit>
				</form>
			</CardContent>
		</Card>
	);
}
