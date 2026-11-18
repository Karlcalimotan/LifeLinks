import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { loginAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { Activity, Radio, Satellite, ShieldAlert } from "lucide-react";
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
		error === "rate"
			? "Too many attempts. Wait a few minutes and try again."
			: error === "invalid"
				? t("invalid")
				: null;

	return (
		<div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
			<section className="relative hidden overflow-hidden border-r border-slate-800/70 p-12 lg:flex lg:flex-col lg:justify-between">
				<div className="absolute inset-0 grid-lines opacity-60" />
				<div className="relative">
					<div className="flex items-center gap-3">
						<span className="grid size-10 place-items-center rounded-xl bg-brand-500 text-sm font-black text-slate-950">
							LL
						</span>
						<div>
							<p className="text-lg font-semibold text-white">{APP_NAME}</p>
							<p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
								Fleet safety platform
							</p>
						</div>
					</div>
					<h1 className="mt-16 max-w-xl text-4xl font-semibold leading-tight text-white">
						Every second after impact matters. LifeLink starts the response.
					</h1>
					<p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">{APP_TAGLINE}</p>
				</div>

				<div className="relative grid gap-3 sm:grid-cols-2">
					{[
						{
							icon: Activity,
							title: "Impact + tilt fusion",
							body: "MPU-6050 and SW-420 confirm a real crash, not a pothole.",
						},
						{
							icon: Satellite,
							title: "GPS last known point",
							body: "A cold fix never blocks the SOS. The age is always shown.",
						},
						{
							icon: Radio,
							title: "SMS + dashboard alert",
							body: "The A7670E sends SMS; the console keeps the evidence trail.",
						},
						{
							icon: ShieldAlert,
							title: "Driver cancel window",
							body: "15 seconds to stop a false alarm before it goes out.",
						},
					].map((item) => (
						<div
							key={item.title}
							className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4"
						>
							<item.icon className="size-4 text-brand-400" />
							<p className="mt-2 text-xs font-semibold text-slate-200">{item.title}</p>
							<p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.body}</p>
						</div>
					))}
				</div>
			</section>

			<section className="flex items-center justify-center p-6">
				<div className="w-full max-w-sm">
					<div className="mb-8 lg:hidden">
						<span className="grid size-10 place-items-center rounded-xl bg-brand-500 text-sm font-black text-slate-950">
							LL
						</span>
						<p className="mt-3 text-lg font-semibold text-white">{APP_NAME}</p>
					</div>

					<h2 className="text-2xl font-semibold text-white">{t("signIn")}</h2>
					<p className="mt-1 text-sm text-slate-400">{t("signInSubtitle")}</p>

					{errorMessage ? (
						<p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
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
								placeholder="admin@lifelink.local"
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
						<Button type="submit" size="lg" className="mt-2 w-full">
							{t("signIn")}
						</Button>
					</form>

					<p className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-500">
						{t("demoHint")}
					</p>

					<p className="mt-8 text-center text-[11px] text-slate-600">
						{common("appName")} · {common("tagline")}
					</p>
				</div>
			</section>
		</div>
	);
}
