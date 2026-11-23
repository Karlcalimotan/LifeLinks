"use client";

import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { InviteLink } from "@/components/settings/invite-link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import {
	type ReinviteState,
	reinviteMemberAction,
	revokeMemberAction,
} from "@/lib/actions/invitations";
import type { MemberRoleName } from "@/lib/auth/roles";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

const initial: ReinviteState = { ok: false };

const errorKeys = {
	forbidden: "reInviteErrorForbidden",
	invalid: "reInviteErrorInvalid",
	notfound: "reInviteErrorNotFound",
	active: "reInviteErrorActive",
} as const;

export function MemberRowActions({
	locale,
	membershipId,
	name,
	role,
	revoked,
	isSelf,
	isLastAdmin,
}: {
	locale: string;
	membershipId: string;
	name: string;
	role: MemberRoleName;
	revoked: boolean;
	isSelf: boolean;
	isLastAdmin: boolean;
}) {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const roles = useTranslations("roles");
	const [state, formAction, pending] = useActionState(reinviteMemberAction, initial);
	const errorMessage = state.error ? t(errorKeys[state.error]) : null;

	if (!revoked) {
		if (isSelf) {
			return <span className="text-meta text-fog-500">{t("memberYou")}</span>;
		}
		if (isLastAdmin) {
			return <span className="text-meta text-fog-500">{t("memberLastAdmin")}</span>;
		}
		return (
			<form action={revokeMemberAction}>
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="membershipId" value={membershipId} />
				<ConfirmSubmit
					message={t("revokeConfirm", { name })}
					confirmLabel={t("revoke")}
					cancelLabel={common("cancel")}
					variant="danger"
				>
					{t("revoke")}
				</ConfirmSubmit>
			</form>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<form action={formAction} className="flex flex-wrap items-center gap-2">
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="membershipId" value={membershipId} />
				<Select name="role" defaultValue={role} className="h-9 w-36" aria-label={t("inviteRole")}>
					<option value="USER">{roles("user")}</option>
					<option value="RESPONDER">{roles("responder")}</option>
					<option value="ADMIN">{roles("admin")}</option>
				</Select>
				<Button type="submit" size="sm" variant="outline" disabled={pending}>
					{t("reInvite")}
				</Button>
			</form>
			{errorMessage ? (
				<p role="alert" className="text-meta text-alarm-300">
					{errorMessage}
				</p>
			) : null}
			{state.ok && state.inviteUrl ? (
				<InviteLink url={state.inviteUrl} expiresAt={state.expiresAt} locale={locale} />
			) : null}
		</div>
	);
}
