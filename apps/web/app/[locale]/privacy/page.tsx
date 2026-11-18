import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "privacy" });
	const common = await getTranslations({ locale, namespace: "common" });

	return (
		<main className="mx-auto max-w-2xl px-6 py-16">
			<Link href="/dashboard" className="text-xs text-brand-400">
				← {common("back")}
			</Link>
			<h1 className="mt-6 text-3xl font-semibold text-white">{t("title")}</h1>
			<p className="mt-4 text-sm leading-relaxed text-slate-400">{t("body")}</p>
			<p className="mt-4 text-sm leading-relaxed text-slate-400">
				Telemetry is retained for the period configured in Settings. Incident evidence is retained
				separately because it may be needed for insurance or legal review. Members of other
				organizations cannot query your vehicles or incidents.
			</p>
		</main>
	);
}
