import { type Locale, locales } from "@/i18n/routing";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { notFound } from "next/navigation";
import { Toaster } from "sonner";
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
	themeColor: "#071013",
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

	const [messages, t] = await Promise.all([
		getMessages(),
		getTranslations({ locale, namespace: "common" }),
	]);

	return (
		<html lang={locale} className="dark">
			<body className={`${barlow.variable} ${barlowCondensed.variable} font-sans`}>
				<NextIntlClientProvider messages={messages}>
					{children}
					<Toaster
						theme="dark"
						position="top-right"
						toastOptions={{
							style: {
								background: "#0d1c21",
								border: "1px solid #1a3a42",
								color: "#e8f1f2",
								borderRadius: "4px",
								fontFamily: "var(--font-barlow), sans-serif",
							},
						}}
					/>
				</NextIntlClientProvider>
				<span className="sr-only">{t("tagline")}</span>
			</body>
		</html>
	);
}
