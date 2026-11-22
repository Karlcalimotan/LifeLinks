import type { AlertTargets } from "@/lib/alerts/templates";

export interface TargetSummary {
	total: number;
	phones: number;
	emails: number;
	channels: Array<"SMS" | "EMAIL">;
}

/**
 * The intake route queues one row per target after `alertTargetsFromSettings`
 * has dropped entries it cannot use. The summary counts the targets that would
 * actually be queued, not the raw textarea lines.
 */
export function summarizeTargets(targets: AlertTargets): TargetSummary {
	const phones = new Set(targets.phones).size;
	const emails = new Set(targets.emails).size;
	const channels: Array<"SMS" | "EMAIL"> = [];
	if (phones > 0) channels.push("SMS");
	if (emails > 0) channels.push("EMAIL");
	return { total: phones + emails, phones, emails, channels };
}
