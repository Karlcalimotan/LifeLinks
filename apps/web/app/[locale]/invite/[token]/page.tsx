import { InviteAcceptForm } from "@/components/settings/invite-accept-form";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { roleLabelKey } from "@/lib/auth/roles";
import {
	hashInvitationToken,
	isInvitationTokenShape,
	isInvitationUsable,
} from "@/lib/invitations/token";
import prisma from "@/lib/prisma";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "invite" });
	return {
		title: t("title"),
		// An invitation is a capability; keep it out of search engines.
		robots: { index: false, follow: false },
	};
}

export default async function InvitePage({
	params,
}: {
	params: Promise<{ locale: string; token: string }>;
}) {
	const { locale, token } = await params;
	const t = await getTranslations({ locale, namespace: "invite" });
	const roleNames = await getTranslations({ locale, namespace: "roles" });

	const tokenHash = isInvitationTokenShape(token) ? hashInvitationToken(token) : null;
	const invitation = tokenHash
		? await prisma.invitationToken.findUnique({
				where: { tokenHash },
				include: { org: { select: { name: true, status: true } } },
			})
		: null;
	const usable =
		invitation != null && invitation.org.status === "ACTIVE" && isInvitationUsable(invitation);

	if (!invitation || !usable) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-ink-900 p-6">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>{t("invalidTitle")}</CardTitle>
						<CardDescription>{t("invalidBody")}</CardDescription>
					</CardHeader>
					<CardContent>
						<Link href="/login" className={buttonClasses({ variant: "outline" })}>
							{t("backToLogin")}
						</Link>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-ink-900 p-6">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t("title")}</CardTitle>
					<CardDescription>{t("subtitle", { org: invitation.org.name })}</CardDescription>
				</CardHeader>
				<CardContent>
					<InviteAcceptForm
						locale={locale}
						token={token}
						email={invitation.email}
						roleLabel={roleNames(roleLabelKey(invitation.role))}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
