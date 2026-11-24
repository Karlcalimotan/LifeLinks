"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import {
	type EmergencyContactFormState,
	createEmergencyContactAction,
	updateEmergencyContactAction,
} from "@/lib/actions/emergency-contacts";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

const initial: EmergencyContactFormState = { ok: false };

export interface ContactValues {
	id: string;
	name: string;
	phone: string;
	email: string | null;
	active: boolean;
}

/**
 * Create and edit share one form. The vehicle is fixed by the page the contact
 * belongs to, so the owner can never point a contact at another owner's car;
 * the action re-checks the vehicle scope even if the hidden field is edited.
 */
export function ContactForm({
	locale,
	vehicleId,
	contact,
}: {
	locale: string;
	vehicleId: string;
	contact?: ContactValues;
}) {
	const t = useTranslations("vehicles");
	const editing = contact != null;
	const [state, formAction, pending] = useActionState(
		editing ? updateEmergencyContactAction : createEmergencyContactAction,
		initial,
	);
	const prefix = editing ? `edit-contact-${contact.id}` : "new-contact";

	function errorText(): string {
		switch (state.error) {
			case "duplicate":
				return t("contactDuplicate");
			case "forbidden":
				return t("formForbidden");
			case "notfound":
				return t("formNotFound");
			case "vehicle":
				return t("contactVehicleError");
			default:
				return t("formError");
		}
	}

	return (
		<form action={formAction} className="grid gap-3 sm:grid-cols-2">
			<input type="hidden" name="locale" value={locale} />
			<input type="hidden" name="vehicleId" value={vehicleId} />
			{editing ? <input type="hidden" name="contactId" value={contact.id} /> : null}
			<Field>
				<Label htmlFor={`${prefix}-name`}>{t("contactName")}</Label>
				<Input
					id={`${prefix}-name`}
					name="name"
					defaultValue={contact?.name ?? ""}
					maxLength={120}
					required
				/>
				{state.fieldErrors?.name ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.name}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor={`${prefix}-phone`}>{t("contactPhone")}</Label>
				<Input
					id={`${prefix}-phone`}
					name="phone"
					type="tel"
					defaultValue={contact?.phone ?? ""}
					maxLength={30}
					placeholder="+63 917 123 4567"
					required
				/>
				{state.fieldErrors?.phone ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.phone}</p>
				) : null}
			</Field>
			<Field>
				<Label htmlFor={`${prefix}-email`}>{t("contactEmail")}</Label>
				<Input
					id={`${prefix}-email`}
					name="email"
					type="email"
					defaultValue={contact?.email ?? ""}
					maxLength={160}
				/>
				{state.fieldErrors?.email ? (
					<p className="text-[11px] text-alarm-300">{state.fieldErrors.email}</p>
				) : null}
			</Field>
			<Field className="justify-end">
				<label className="flex min-h-10 items-center gap-2 text-meta text-fog-300">
					<input
						type="checkbox"
						name="active"
						defaultChecked={contact?.active ?? true}
						className="size-4 rounded border-ink-600 bg-ink-950 accent-signal-500"
					/>
					{t("contactActive")}
				</label>
				<p className="text-[11px] text-fog-500">{t("contactActiveHint")}</p>
			</Field>
			<div className="flex flex-wrap items-center gap-3 sm:col-span-2">
				<Button type="submit" size="sm" disabled={pending}>
					{pending ? t("savingContact") : editing ? t("saveContact") : t("addContact")}
				</Button>
				{state.ok ? (
					<span aria-live="polite" className="text-xs text-clear-300">
						{editing ? t("contactUpdated") : t("contactAdded")}
					</span>
				) : null}
				{!state.ok && state.error ? (
					<span role="alert" className="text-xs text-alarm-300">
						{errorText()}
					</span>
				) : null}
			</div>
		</form>
	);
}
