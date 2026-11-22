"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

export default function MapError({
	reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
	const t = useTranslations("map.error");

	return (
		<Card className="mx-auto mt-10 max-w-xl">
			<CardContent className="flex flex-col gap-4 p-6">
				<h1 className="font-display text-section font-semibold text-fog-50">{t("title")}</h1>
				<p className="text-body text-fog-500">{t("body")}</p>
				<div className="flex flex-wrap items-center gap-3">
					<Button type="button" size="sm" onClick={reset}>
						{t("tryAgain")}
					</Button>
					<Link href="/dashboard" className="text-meta text-fog-300 underline hover:text-fog-100">
						{t("back")}
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
