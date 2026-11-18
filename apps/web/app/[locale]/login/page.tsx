import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { loginAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { Activity, Hand, Radio, Timer } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export default async function LoginPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ error?: string }>;
}) {
	const { locale } = await params;
	const { error } = await searchParams;
	const current = await getCurrentUser();
	if (current) redirect(`/${locale}/dashboard`);

	const t = await getTranslations({ locale, namespace: "auth" });
	const common = await getTranslations({ locale, namespace: "common" });

	const errorMessage =
		error === "rate" ? t("rateLimited") : error === "invalid" ? t("invalid") : null;
	const demoAccounts = t("demoHint")
		.replace(/^Demo:\s*/, "")
		.split(" · ");

	const path = [
		{ label: t("pathImpact"), icon: Activity },
		{ label: t("pathConfirm"), icon: Timer },
		{ label: t("pathCancel"), icon: Hand },
		{ label: t("pathAlert"), icon: Radio },
	];

	return (
		<div className="grid min-h-screen lg:grid-cols-[1.15fr_0.85fr]">
			<section className="relative hidden overflow-hidden border-r border-ink-700 bg-ink-950 p-10 lg:flex lg:flex-col xl:p-12">
				<div
					className="pointer-events-none absolute inset-0 console-grid opacity-60"
					style={{ maskImage: "linear-gradient(to bottom, black, transparent 88%)" }}
				/>
				<div className="relative flex items-center justify-between gap-4">
					<Logo />
				</div>

				<div className="relative mt-16 max-w-2xl">
					<div className="flex items-center gap-2 text-[11px] font-medium text-signal-400">
						<span className="size-1.5 bg-signal-500 beacon-pulse" aria-hidden="true" />
						{t("consoleLabel")}
					</div>
					<h1 className="mt-5 max-w-xl font-display text-6xl font-semibold leading-[0.9] tracking-tight text-fog-50 xl:text-7xl">
						{t("heroTitle")}
					</h1>
					<p className="mt-6 max-w-lg text-sm leading-relaxed text-fog-300">{t("heroBody")}</p>
				</div>

				<ol className="relative mt-auto border-y border-ink-700">
					{path.map((item, index) => (
						<li
							key={item.label}
							className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 border-b border-ink-700/70 py-3.5 last:border-0"
						>
							<span className="font-display text-2xl leading-none text-signal-500">
								{`0${index + 1}`}
							</span>
							<span className="text-sm font-medium text-fog-100">{item.label}</span>
							<item.icon className="size-4 text-fog-500" aria-hidden="true" />
						</li>
					))}
				</ol>

				<p className="relative pt-6 text-[11px] text-fog-500">{t("prototypeNote")}</p>
			</section>

			<section className="relative flex items-center justify-center bg-ink-900 p-6 sm:p-10">
				<div className="w-full max-w-sm">
					<div className="mb-8 lg:hidden">
						<Logo />
					</div>

					<div className="cut-corner border border-ink-700 bg-ink-800">
						<div className="h-1 hazard-stripe" aria-hidden="true" />
						<div className="p-6">
							<h2 className="font-display text-3xl font-semibold leading-none tracking-tight text-fog-50">
								{t("signIn")}
							</h2>
							<p className="mt-2 text-sm leading-relaxed text-fog-500">{t("signInSubtitle")}</p>

							{errorMessage ? (
								<p className="mt-4 rounded-[3px] border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-xs text-alarm-300">
									{errorMessage}
								</p>
							) : null}

							<form action={loginAction} className="mt-6 flex flex-col gap-4">
								<input type="hidden" name="locale" value={locale} />
								<Field>
									<Label htmlFor="email">{t("email")}</Label>
									<Input
										id="email"
										name="email"
										type="email"
										autoComplete="email"
										required
										placeholder="name@company.ph"
									/>
								</Field>
								<Field>
									<Label htmlFor="password">{t("password")}</Label>
									<Input
										id="password"
										name="password"
										type="password"
										autoComplete="current-password"
										required
									/>
								</Field>
								<Button type="submit" size="lg" className="mt-1 w-full">
									{t("signIn")}
								</Button>
							</form>
						</div>
					</div>

					<div className="mt-4 border border-ink-700 bg-ink-900/60 p-3">
						<p className="text-[11px] font-medium text-fog-300">{t("demoAccess")}</p>
						<ul className="mt-1.5 flex flex-col gap-1">
							{demoAccounts.map((account) => (
								<li key={account} className="text-[11px] leading-relaxed text-fog-500">
									{account}
								</li>
							))}
						</ul>
					</div>

					<p className="mt-8 text-center text-[11px] text-fog-500">
						{APP_NAME}. {APP_TAGLINE}
					</p>
				</div>
			</section>
		</div>
	);
}
