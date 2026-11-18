import { type Locale, locales } from "@/i18n/routing";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { Toaster } from "sonner";
import "../globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
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
	themeColor: "#060b14",
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
			<body className={`${inter.variable} font-sans`}>
				<NextIntlClientProvider messages={messages}>
					{children}
					<Toaster
						theme="dark"
						position="top-right"
						toastOptions={{
							style: {
								background: "#0b1220",
								border: "1px solid #1e293b",
								color: "#e2e8f0",
							},
						}}
					/>
				</NextIntlClientProvider>
				<span className="sr-only">{t("tagline")}</span>
			</body>
		</html>
	);
}
