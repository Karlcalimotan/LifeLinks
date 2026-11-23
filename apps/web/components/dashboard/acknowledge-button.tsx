"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

export function AcknowledgeButton() {
	const t = useTranslations("dashboard");
	const { pending } = useFormStatus();

	return (
		<Button type="submit" size="sm" variant="secondary" disabled={pending}>
			{pending ? t("acknowledging") : t("acknowledge")}
		</Button>
	);
}
