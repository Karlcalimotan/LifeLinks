"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";

export default function IncidentsError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const t = useTranslations("incidents");

	return (
		<Card className="mx-auto mt-10 max-w-xl">
			<CardContent className="flex flex-col gap-4 p-6">
				<h1 className="font-display text-section font-semibold text-fog-50">{t("errorTitle")}</h1>
				<p className="text-body text-fog-500">{t("errorBody")}</p>
				<div>
					<Button type="button" size="sm" onClick={reset}>
						{t("retry")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
