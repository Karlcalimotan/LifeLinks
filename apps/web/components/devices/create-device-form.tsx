"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select } from "@/components/ui/field";
import { type DeviceTokenState, createDeviceAction } from "@/lib/actions/devices";
import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";

const initial: DeviceTokenState = { ok: false };

export function CreateDeviceForm({
	locale,
	vehicles,
}: {
	locale: string;
	vehicles: Array<{ id: string; label: string }>;
}) {
	const [state, formAction, pending] = useActionState(createDeviceAction, initial);
	const [copied, setCopied] = useState(false);

	async function copyToken() {
		if (!state.token) return;
		await navigator.clipboard.writeText(state.token);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="flex flex-col gap-4">
			<form action={formAction} className="grid gap-3 sm:grid-cols-2">
				<input type="hidden" name="locale" value={locale} />
				<Field>
					<Label htmlFor="device-label">Label</Label>
					<Input id="device-label" name="label" placeholder="Navara tracker" required />
				</Field>
				<Field>
					<Label htmlFor="device-mac">MAC address</Label>
					<Input id="device-mac" name="mac" placeholder="AA:BB:CC:DD:EE:01" required />
				</Field>
				<Field className="sm:col-span-2">
					<Label htmlFor="device-vehicle">Assign to vehicle (optional)</Label>
					<Select id="device-vehicle" name="vehicleId" defaultValue="">
						<option value="">Unassigned</option>
						{vehicles.map((vehicle) => (
							<option key={vehicle.id} value={vehicle.id}>
								{vehicle.label}
							</option>
						))}
					</Select>
				</Field>
				<div className="sm:col-span-2">
					<Button type="submit" size="sm" disabled={pending}>
						{pending ? "Registering…" : "Register tracker"}
					</Button>
				</div>
			</form>

			{state.error ? (
				<p className="rounded border border-alarm-500/30 bg-alarm-500/10 px-3 py-2 text-xs text-alarm-300">
					{state.error}
				</p>
			) : null}

			{state.ok && state.token ? (
				<div className="rounded border border-clear-500/30 bg-clear-500/10 p-4">
					<p className="text-xs font-semibold text-clear-200">
						Tracker registered. Copy this token now — it is shown once.
					</p>
					<div className="mt-2 flex items-center gap-2">
						<code className="min-w-0 flex-1 overflow-x-auto rounded border border-clear-500/20 bg-ink-950/60 px-3 py-2 text-xs text-clear-200">
							{state.token}
						</code>
						<Button type="button" size="sm" variant="outline" onClick={copyToken}>
							{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
							{copied ? "Copied" : "Copy"}
						</Button>
					</div>
					<p className="mt-2 text-[11px] text-clear-300/70">
						MAC {state.mac}. Enter the token in the device setup portal.
					</p>
				</div>
			) : null}
		</div>
	);
}
