"use client";

import { InviteLink } from "@/components/settings/invite-link";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select } from "@/components/ui/field";
import { type InvitationState, createInvitationAction } from "@/lib/actions/invitations";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

const initial: InvitationState = { ok: false };

const errorKeys = {
	forbidden: "inviteErrorForbidden",
	invalid: "inviteErrorInvalid",
	exists: "inviteErrorExists",
} as const;

export function InviteMemberForm({ locale }: { locale: string }) {
	const t = useTranslations("settings");
	const roles = useTranslations("roles");
	const [state, formAction, pending] = useActionState(createInvitationAction, initial);
	const errorMessage = state.error ? t(errorKeys[state.error]) : null;
	const roleLabels = {
		USER: roles("user"),
		RESPONDER: roles("responder"),
		ADMIN: roles("admin"),
	} as const;

	return (
		<div className="flex flex-col gap-4">
			<form action={formAction} className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto]">
				<input type="hidden" name="locale" value={locale} />
				<Field>
					<Label htmlFor="invite-email">{t("inviteEmail")}</Label>
					<Input
						id="invite-email"
						name="email"
						type="email"
						autoComplete="off"
						placeholder="name@company.ph"
						required
					/>
				</Field>
				<Field>
					<Label htmlFor="invite-role">{t("inviteRole")}</Label>
					<Select id="invite-role" name="role" defaultValue="USER">
						<option value="USER">{roles("user")}</option>
						<option value="RESPONDER">{roles("responder")}</option>
						<option value="ADMIN">{roles("admin")}</option>
					</Select>
				</Field>
				<Button type="submit" disabled={pending}>
					{t("inviteSubmit")}
				</Button>
			</form>

			{errorMessage ? (
				<p
					role="alert"
					className="rounded-control border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300"
				>
					{errorMessage}
				</p>
			) : null}

			{state.ok && state.inviteUrl ? (
				<div className="flex flex-col gap-2">
					<p className="text-meta text-fog-300">
						{t("inviteCreated", {
							email: state.email ?? "",
							role: state.role ? roleLabels[state.role] : "",
						})}
					</p>
					<InviteLink url={state.inviteUrl} expiresAt={state.expiresAt} locale={locale} />
				</div>
			) : null}
		</div>
	);
}
