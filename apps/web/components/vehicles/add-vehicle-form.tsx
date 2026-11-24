"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select } from "@/components/ui/field";
import { Link } from "@/i18n/routing";
import { type VehicleFormState, createVehicleAction } from "@/lib/actions/vehicles";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

const initial: VehicleFormState = { ok: false };

export interface VehicleOwnerOption {
	id: string;
	name: string;
	email: string;
}

/**
 * The add form is disclosure content on the vehicles list. An owner never sees
 * the owner picker: the action forces `ownerId` to the caller. An admin may
 * leave it unassigned or pick an active member of the organization.
 */
export function AddVehicleForm({
	locale,
	owners,
}: {
	locale: string;
	owners?: VehicleOwnerOption[];
}) {
	const t = useTranslations("vehicles");
	const [state, formAction, pending] = useActionState(createVehicleAction, initial);

	return (
		<form action={formAction} className="grid gap-3 sm:grid-cols-2">
			<input type="hidden" name="locale" value={locale} />
			<Field>
				<Label htmlFor="new-vehicle-plate">{t("plate")}</Label>
				<Input id="new-vehicle-plate" name="plateNo" maxLength={20} required />
				{state.fieldErrors?.plateNo ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.plateNo}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor="new-vehicle-make">{t("make")}</Label>
				<Input id="new-vehicle-make" name="make" maxLength={60} required />
				{state.fieldErrors?.make ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.make}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor="new-vehicle-model">{t("model")}</Label>
				<Input id="new-vehicle-model" name="model" maxLength={60} required />
				{state.fieldErrors?.model ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.model}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor="new-vehicle-year">{t("year")}</Label>
				<Input
					id="new-vehicle-year"
					name="year"
					type="number"
					inputMode="numeric"
					min={1900}
					max={2100}
				/>
				{state.fieldErrors?.year ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.year}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor="new-vehicle-vin">{t("vin")}</Label>
				<Input id="new-vehicle-vin" name="vin" maxLength={40} />
				{state.fieldErrors?.vin ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.vin}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor="new-vehicle-driver">{t("driverName")}</Label>
				<Input id="new-vehicle-driver" name="driverName" maxLength={120} />
				{state.fieldErrors?.driverName ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.driverName}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor="new-vehicle-driver-phone">{t("driverPhone")}</Label>
				<Input
					id="new-vehicle-driver-phone"
					name="driverPhone"
					type="tel"
					maxLength={30}
					placeholder="+63 917 123 4567"
				/>
				{state.fieldErrors?.driverPhone ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.driverPhone}</p>
				) : null}
			</Field>
			{owners ? (
				<Field>
					<Label htmlFor="new-vehicle-owner">{t("owner")}</Label>
					<Select id="new-vehicle-owner" name="ownerId" defaultValue="">
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
					{pending ? t("adding") : t("addVehicle")}
				</Button>
				{state.ok && state.vehicleId ? (
					<span aria-live="polite" className="text-xs text-clear-300">
						{t("vehicleAdded")}{" "}
						<Link href={`/vehicles/${state.vehicleId}`} className="underline">
							{t("openVehicle")}
						</Link>
					</span>
				) : null}
				{!state.ok && state.error ? (
					<span role="alert" className="text-xs text-alarm-300">
						{state.error === "forbidden"
							? t("formForbidden")
							: state.error === "owner"
								? t("formOwnerError")
								: t("formError")}
					</span>
				) : null}
			</div>
		</form>
	);
}
