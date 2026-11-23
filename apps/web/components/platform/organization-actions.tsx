"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import {
	type PlatformActionError,
	type PlatformActionState,
	reinstateOrganizationAction,
	suspendOrganizationAction,
} from "@/lib/actions/platform";
import { Ban, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

const initial: PlatformActionState = { ok: false };

const errorKeys: Record<PlatformActionError, string> = {
	forbidden: "errorForbidden",
	invalid: "errorReason",
	password: "errorPassword",
	notfound: "errorNotFound",
	already: "errorAlready",
	rate: "errorRate",
};

/**
 * One row's suspend/reinstate control. The reason and the operator's password
 * are both required by the server action; the HTML attributes are only a
 * convenience, never the enforcement.
 */
export function OrganizationActions({
	locale,
	orgId,
	orgName,
	status,
}: {
	locale: string;
	orgId: string;
	orgName: string;
	status: "ACTIVE" | "SUSPENDED";
}) {
	const t = useTranslations("platform");
	const [suspendState, suspendAction, suspendPending] = useActionState(
		suspendOrganizationAction,
		initial,
	);
	const [reinstateState, reinstateAction, reinstatePending] = useActionState(
		reinstateOrganizationAction,
		initial,
	);

	const suspended = status === "SUSPENDED";
	const state = suspended ? reinstateState : suspendState;
	const formAction = suspended ? reinstateAction : suspendAction;
	const pending = suspended ? reinstatePending : suspendPending;
	const errorMessage = state.error ? t(errorKeys[state.error]) : null;

	return (
		<details className="group">
			<summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-panel border border-ink-600 px-3 text-meta font-medium text-fog-100 transition-colors hover:border-signal-500/60 hover:bg-ink-700/60">
				{suspended ? (
					<RotateCcw className="size-3.5" aria-hidden="true" />
				) : (
					<Ban className="size-3.5" aria-hidden="true" />
				)}
				{suspended ? t("reinstate") : t("suspend")}
			</summary>
			<form action={formAction} className="mt-3 flex w-72 flex-col gap-3">
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="orgId" value={orgId} />
				<Field>
					<Label htmlFor={`reason-${orgId}`}>{t("reason")}</Label>
					<Textarea
						id={`reason-${orgId}`}
						name="reason"
						required
						minLength={5}
						maxLength={500}
						rows={3}
						placeholder={t("reasonPlaceholder")}
					/>
					<p className="text-meta text-fog-500">{t("reasonHint")}</p>
				</Field>
				<Field>
					<Label htmlFor={`password-${orgId}`}>{t("password")}</Label>
					<Input
						id={`password-${orgId}`}
						name="password"
						type="password"
						autoComplete="current-password"
						required
						maxLength={200}
					/>
					<p className="text-meta text-fog-500">{t("passwordHint")}</p>
				</Field>
				<Button
					type="submit"
					size="sm"
					variant={suspended ? "primary" : "danger"}
					disabled={pending}
				>
					{pending
						? t("working")
						: suspended
							? t("submitReinstate", { org: orgName })
							: t("submitSuspend", { org: orgName })}
				</Button>
				{errorMessage ? (
					<p
						role="alert"
						className="rounded-control border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300"
					>
						{errorMessage}
					</p>
				) : null}
			</form>
		</details>
	);
}
