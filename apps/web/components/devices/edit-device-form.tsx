"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select } from "@/components/ui/field";
import { type DeviceEditState, updateDeviceAction } from "@/lib/actions/devices";
import { useActionState } from "react";

const initial: DeviceEditState = { ok: false };

export function EditDeviceForm({
	locale,
	device,
	vehicles,
}: {
	locale: string;
	device: { id: string; label: string; mac: string; vehicleId: string | null };
	vehicles: Array<{ id: string; label: string }>;
}) {
	const [state, formAction, pending] = useActionState(updateDeviceAction, initial);

	return (
		<form action={formAction} className="grid gap-3 sm:grid-cols-2">
			<input type="hidden" name="locale" value={locale} />
			<input type="hidden" name="deviceId" value={device.id} />
			<Field>
				<Label htmlFor="edit-device-label">Label</Label>
				<Input
					id="edit-device-label"
					name="label"
					defaultValue={device.label}
					minLength={2}
					maxLength={80}
					required
				/>
			</Field>
			<Field>
				<Label htmlFor="edit-device-mac">MAC address</Label>
				<Input id="edit-device-mac" value={device.mac} readOnly className="font-mono" />
				<p className="text-[11px] text-fog-500">
					The MAC is the tracker identity and cannot be changed.
				</p>
			</Field>
			<Field className="sm:col-span-2">
				<Label htmlFor="edit-device-vehicle">Assigned vehicle</Label>
				<Select id="edit-device-vehicle" name="vehicleId" defaultValue={device.vehicleId ?? ""}>
					<option value="">Unassigned</option>
					{vehicles.map((vehicle) => (
						<option key={vehicle.id} value={vehicle.id}>
							{vehicle.label}
						</option>
					))}
				</Select>
			</Field>
			<div className="flex flex-wrap items-center gap-3 sm:col-span-2">
				<Button type="submit" size="sm" disabled={pending}>
					{pending ? "Saving…" : "Save changes"}
				</Button>
				{state.ok ? <span className="text-xs text-clear-300">Tracker updated.</span> : null}
				{state.error ? <span className="text-xs text-alarm-300">{state.error}</span> : null}
			</div>
		</form>
	);
}
