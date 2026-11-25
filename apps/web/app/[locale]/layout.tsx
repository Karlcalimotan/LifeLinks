import { InstallPromptProvider } from "@/components/pwa/install-prompt";
import { ServiceWorkerRuntime } from "@/components/pwa/service-worker-runtime";
import { type Locale, locales } from "@/i18n/routing";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
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
	applicationName: APP_NAME,
	appleWebApp: {
		capable: true,
		title: APP_NAME,
		// Opaque status bar: content stays below it, so the header and the
		// update banner do not need safe-area padding.
		statusBarStyle: "black",
	},
	icons: {
		icon: [
			{ url: "/favicon.svg", type: "image/svg+xml" },
			{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
		],
		apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
			<body
				className={`${barlow.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable} font-sans`}
			>
				<NextIntlClientProvider messages={messages}>
					<InstallPromptProvider>
						{children}
						<ServiceWorkerRuntime />
						<Toaster
							theme="dark"
							position="top-right"
							toastOptions={{
								style: {
									background: "var(--color-ink-800)",
									border: "1px solid var(--color-ink-600)",
									color: "var(--color-fog-100)",
									borderRadius: "var(--radius-panel)",
									fontFamily: "var(--font-barlow), sans-serif",
								},
							}}
						/>
					</InstallPromptProvider>
				</NextIntlClientProvider>
				<span className="sr-only">{t("tagline")}</span>
			</body>
		</html>
	);
}
