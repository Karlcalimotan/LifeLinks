import { ThemeToaster } from "@/components/ui/theme-toaster";
import { type Locale, locales } from "@/i18n/routing";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { resolveSiteUrl } from "@/lib/site-url";
import { readThemePreference } from "@/lib/theme-server";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import Script from "next/script";
import "../globals.css";

const barlow = Barlow({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-barlow",
});

const barlowCondensed = Barlow_Condensed({
	subsets: ["latin"],
	weight: ["600", "700"],
	variable: "--font-barlow-condensed",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
	metadataBase: new URL(resolveSiteUrl()),
	title: {
		default: `${APP_NAME} — ${APP_TAGLINE}`,
		template: `%s | ${APP_NAME}`,
	},
	description: APP_TAGLINE,
	icons: {
		icon: "/favicon.svg",
	},
};

export const viewport: Viewport = {
	// Browser chrome needs literal colours; these mirror ink-950 in both themes.
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "rgb(7 16 19)" },
		{ media: "(prefers-color-scheme: light)", color: "rgb(238 243 242)" },
	],
	width: "device-width",
	initialScale: 1,
};

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!locales.includes(locale as Locale)) notFound();

	const [messages, t, themePreference] = await Promise.all([
		getMessages(),
		getTranslations({ locale, namespace: "common" }),
		readThemePreference(),
	]);

	return (
		<html
			lang={locale}
			data-theme={themePreference === "system" ? undefined : themePreference}
			data-theme-preference={themePreference}
			suppressHydrationWarning
		>
			<body
				className={`${barlow.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable} font-sans`}
			>
				<Script id="ll-theme-init" strategy="beforeInteractive">
					{`(function(){try{var root=document.documentElement;var preference=root.getAttribute("data-theme-preference")||"system";var resolved=preference==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):preference;root.setAttribute("data-theme",resolved);root.style.colorScheme=resolved;}catch(error){}})();`}
				</Script>
				<NextIntlClientProvider messages={messages}>
					{children}
					<ThemeToaster />
				</NextIntlClientProvider>
				<span className="sr-only">{t("tagline")}</span>
			</body>
		</html>
	);
}
