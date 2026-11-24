"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label, Select } from "@/components/ui/field";
import { type VehicleFormState, updateVehicleAction } from "@/lib/actions/vehicles";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { VehicleOwnerOption } from "./add-vehicle-form";

const initial: VehicleFormState = { ok: false };

export interface EditableVehicle {
	id: string;
	plateNo: string;
	make: string;
	model: string;
	year: number | null;
	vin: string | null;
	driverName: string | null;
	driverPhone: string | null;
	ownerId: string | null;
}

/**
 * The owner sees no owner picker and cannot change ownership. An admin may
 * reassign the vehicle to an active member of the same organization, or leave
 * it unassigned.
 */
export function EditVehicleForm({
	locale,
	vehicle,
	owners,
}: {
	locale: string;
	vehicle: EditableVehicle;
	owners?: VehicleOwnerOption[];
}) {
	const t = useTranslations("vehicles");
	const [state, formAction, pending] = useActionState(updateVehicleAction, initial);

	return (
		<Card id="vehicle-details">
			<CardHeader>
				<CardTitle>{t("editVehicleTitle")}</CardTitle>
				<CardDescription>{t("editVehicleDescription")}</CardDescription>
			</CardHeader>
			<CardContent>
				<form action={formAction} className="grid gap-3 sm:grid-cols-2">
					<input type="hidden" name="locale" value={locale} />
					<input type="hidden" name="vehicleId" value={vehicle.id} />
					{owners ? null : <input type="hidden" name="ownerId" value={vehicle.ownerId ?? ""} />}
					<Field>
						<Label htmlFor="edit-vehicle-plate">{t("plate")}</Label>
						<Input
							id="edit-vehicle-plate"
							name="plateNo"
							defaultValue={vehicle.plateNo}
							maxLength={20}
							required
						/>
						{state.fieldErrors?.plateNo ? (
							<p className="text-[11px] text-alarm-300">{state.fieldErrors.plateNo}</p>
						) : null}
					</Field>
					<Field>
						<Label htmlFor="edit-vehicle-make">{t("make")}</Label>
						<Input
							id="edit-vehicle-make"
							name="make"
							defaultValue={vehicle.make}
							maxLength={60}
							required
						/>
						{state.fieldErrors?.make ? (
							<p className="text-[11px] text-alarm-300">{state.fieldErrors.make}</p>
						) : null}
					</Field>
					<Field>
						<Label htmlFor="edit-vehicle-model">{t("model")}</Label>
						<Input
							id="edit-vehicle-model"
							name="model"
							defaultValue={vehicle.model}
							maxLength={60}
							required
						/>
						{state.fieldErrors?.model ? (
							<p className="text-[11px] text-alarm-300">{state.fieldErrors.model}</p>
						) : null}
					</Field>
					<Field>
						<Label htmlFor="edit-vehicle-year">{t("year")}</Label>
						<Input
							id="edit-vehicle-year"
							name="year"
							type="number"
							inputMode="numeric"
							min={1900}
							max={2100}
							defaultValue={vehicle.year ?? ""}
						/>
						{state.fieldErrors?.year ? (
							<p className="text-[11px] text-alarm-300">{state.fieldErrors.year}</p>
						) : null}
					</Field>
					<Field>
						<Label htmlFor="edit-vehicle-vin">{t("vin")}</Label>
						<Input
							id="edit-vehicle-vin"
							name="vin"
							defaultValue={vehicle.vin ?? ""}
							maxLength={40}
						/>
						{state.fieldErrors?.vin ? (
							<p className="text-[11px] text-alarm-300">{state.fieldErrors.vin}</p>
						) : null}
					</Field>
					<Field>
						<Label htmlFor="edit-vehicle-driver">{t("driverName")}</Label>
						<Input
							id="edit-vehicle-driver"
							name="driverName"
							defaultValue={vehicle.driverName ?? ""}
							maxLength={120}
						/>
						{state.fieldErrors?.driverName ? (
							<p className="text-[11px] text-alarm-300">{state.fieldErrors.driverName}</p>
						) : null}
					</Field>
					<Field>
						<Label htmlFor="edit-vehicle-driver-phone">{t("driverPhone")}</Label>
						<Input
							id="edit-vehicle-driver-phone"
							name="driverPhone"
							type="tel"
							defaultValue={vehicle.driverPhone ?? ""}
							maxLength={30}
							placeholder="+63 917 123 4567"
						/>
						{state.fieldErrors?.driverPhone ? (
							<p className="text-[11px] text-alarm-300">{state.fieldErrors.driverPhone}</p>
						) : null}
					</Field>
					{owners ? (
						<Field>
							<Label htmlFor="edit-vehicle-owner">{t("owner")}</Label>
							<Select id="edit-vehicle-owner" name="ownerId" defaultValue={vehicle.ownerId ?? ""}>
								<option value="">{t("unassigned")}</option>
								{owners.map((owner) => (
									<option key={owner.id} value={owner.id}>
										{owner.name} ({owner.email})
									</option>
								))}
							</Select>
							{state.fieldErrors?.ownerId ? (
								<p className="text-[11px] text-alarm-300">{state.fieldErrors.ownerId}</p>
							) : null}
						</Field>
					) : null}
					<div className="flex flex-wrap items-center gap-3 sm:col-span-2">
						<Button type="submit" size="sm" disabled={pending}>
							{pending ? t("savingVehicle") : t("saveVehicle")}
						</Button>
						{state.ok ? (
							<span aria-live="polite" className="text-xs text-clear-300">
								{t("vehicleUpdated")}
							</span>
						) : null}
						{!state.ok && state.error ? (
							<span role="alert" className="text-xs text-alarm-300">
								{state.error === "forbidden"
									? t("formForbidden")
									: state.error === "owner"
										? t("formOwnerError")
										: state.error === "notfound"
											? t("formNotFound")
											: t("formError")}
							</span>
						) : null}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
