"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { type AcceptState, acceptInvitationAction } from "@/lib/actions/invitations";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

const initial: AcceptState = { ok: false };

const errorKeys = {
	invalid: "errorInvalid",
	name: "errorName",
	password: "errorPassword",
	mismatch: "errorMismatch",
} as const;

export function InviteAcceptForm({
	locale,
	token,
	email,
	roleLabel,
}: {
	locale: string;
	token: string;
	email: string;
	roleLabel: string;
}) {
	const t = useTranslations("invite");
	const [state, formAction, pending] = useActionState(acceptInvitationAction, initial);
	const errorMessage = state.error ? t(errorKeys[state.error]) : null;

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="locale" value={locale} />
			<input type="hidden" name="token" value={token} />

			<div className="rounded-control border border-ink-700 bg-ink-950/50 px-3 py-2">
				<p className="font-mono text-meta text-fog-300">{email}</p>
				<p className="mt-0.5 text-meta text-fog-500">{roleLabel}</p>
			</div>

			<Field>
				<Label htmlFor="invite-name">{t("name")}</Label>
				<Input
					id="invite-name"
					name="name"
					autoComplete="name"
					minLength={2}
					maxLength={120}
					required
				/>
			</Field>

			<Field>
				<Label htmlFor="invite-password">{t("password")}</Label>
				<Input
					id="invite-password"
					name="password"
					type="password"
					autoComplete="new-password"
					minLength={8}
					maxLength={128}
					required
					aria-describedby="invite-password-hint"
				/>
				<p id="invite-password-hint" className="text-meta leading-relaxed text-fog-500">
					{t("passwordHint")}
				</p>
			</Field>

			<Field>
				<Label htmlFor="invite-confirm">{t("confirmPassword")}</Label>
				<Input
					id="invite-confirm"
					name="confirmPassword"
					type="password"
					autoComplete="new-password"
					minLength={8}
					maxLength={128}
					required
				/>
			</Field>

			{errorMessage ? (
				<p
					role="alert"
					className="rounded-control border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300"
				>
					{errorMessage}
				</p>
			) : null}

			<Button type="submit" size="lg" disabled={pending}>
				{pending ? t("submitting") : t("submit")}
			</Button>
		</form>
	);
}
