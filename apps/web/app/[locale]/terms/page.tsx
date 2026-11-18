import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "terms" });
	const common = await getTranslations({ locale, namespace: "common" });

	return (
		<main className="mx-auto max-w-2xl px-6 py-16">
			<Link href="/dashboard" className="text-xs text-brand-400">
				← {common("back")}
			</Link>
			<h1 className="mt-6 text-3xl font-semibold text-white">{t("title")}</h1>
			<p className="mt-4 text-sm leading-relaxed text-slate-400">{t("body")}</p>
			<p className="mt-4 text-sm leading-relaxed text-slate-400">
				The platform is provided as-is for a capstone prototype. A missed alert can have
				consequences beyond the software's control: cellular coverage, GPS visibility, device power,
				and sensor mounting all matter. Test the installation on the bench and in the vehicle before
				relying on it.
			</p>
		</main>
	);
}
