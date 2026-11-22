import { AppShell } from "@/components/layout/app-shell";
import { roleLabelKey } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getTranslations } from "next-intl/server";

export default async function DashboardLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "nav" });
	const roles = await getTranslations({ locale, namespace: "roles" });
	const common = await getTranslations({ locale, namespace: "common" });

	const labels = {
		dashboard: t("dashboard"),
		map: t("map"),
		vehicles: t("vehicles"),
		incidents: t("incidents"),
		analytics: t("analytics"),
		notifications: t("notifications"),
		devices: t("devices"),
		settings: t("settings"),
	};

	return (
		<AppShell
			locale={locale}
			user={current.user}
			org={current.org}
			role={current.role}
			roleLabel={roles(roleLabelKey(current.role))}
			navLabels={labels}
			signOutLabel={t("signOut")}
			skipLabel={common("skipToContent")}
		>
			{children}
		</AppShell>
	);
}
