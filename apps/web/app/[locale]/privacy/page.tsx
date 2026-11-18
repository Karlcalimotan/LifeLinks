import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "privacy" });
	const common = await getTranslations({ locale, namespace: "common" });

	return (
		<main className="mx-auto max-w-2xl px-6 py-12">
			<div className="flex items-center justify-between gap-4 border-b border-ink-700 pb-6">
				<Logo compact />
				<Link href="/dashboard" className="text-xs text-signal-400 hover:text-signal-300">
					← {common("back")}
				</Link>
			</div>
			<h1 className="mt-10 font-display text-4xl font-semibold tracking-tight text-fog-50">
				{t("title")}
			</h1>
			<p className="mt-4 text-sm leading-relaxed text-fog-300">{t("body")}</p>
			<p className="mt-4 text-sm leading-relaxed text-fog-300">{t("extra")}</p>
		</main>
	);
}
