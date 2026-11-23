import type { Locale } from "@/i18n/routing";

/**
 * The notification payload and the links it opens.
 *
 * The payload is deliberately tiny: the incident id, the plate, one short
 * sentence and a relative URL. No token, phone number, coordinate, driver name
 * or free-text evidence ever leaves the server through a push message, because
 * the push service (and the lock screen) is outside our trust boundary.
 */

/**
 * Mirrors `locales` in `i18n/routing.ts`. The `satisfies` clause keeps this
 * list inside that union; the module is deliberately free of the `next-intl`
 * runtime so pure tests and the server can import it without a Next router.
 */
export const PUSH_LOCALES = ["en", "tl"] as const satisfies readonly Locale[];

export const INCIDENT_CANCEL_ACTION = "cancel" as const;
export const INCIDENT_CANCEL_QUERY_KEY = "action" as const;

export const PUSH_PLATE_MAX = 40;

export type PushLocale = Locale;

const BODY: Record<Locale, string> = {
	en: "Crash detected. Open to review or stand the alert down.",
	tl: "May na-detect na bangga. Buksan para suriin o ihinto ang alert.",
};

export function normalizePushLocale(value: unknown): Locale {
	return typeof value === "string" && (PUSH_LOCALES as readonly string[]).includes(value)
		? (value as Locale)
		: "en";
}

/** Relative URL that opens the incident with the cancel control in focus. */
export function incidentNotificationUrl(locale: string, incidentId: string): string {
	return `/${normalizePushLocale(locale)}/incidents/${encodeURIComponent(incidentId)}?${INCIDENT_CANCEL_QUERY_KEY}=${INCIDENT_CANCEL_ACTION}`;
}

/** Whether a page URL asked for the cancel control to receive focus. */
export function isCancelActionFocus(value: unknown): boolean {
	return value === INCIDENT_CANCEL_ACTION;
}

export function incidentNotificationTitle(plate: string): string {
	const trimmed = plate.trim().slice(0, PUSH_PLATE_MAX);
	return trimmed.length > 0 ? `LifeLink · ${trimmed}` : "LifeLink";
}

export interface IncidentPushPayload {
	incidentId: string;
	plate: string;
	body: string;
	url: string;
}

export function buildIncidentPushPayload({
	incidentId,
	plate,
	locale,
}: {
	incidentId: string;
	plate: string;
	locale: string;
}): IncidentPushPayload {
	const normalized = normalizePushLocale(locale);
	return {
		incidentId,
		plate: plate.trim().slice(0, PUSH_PLATE_MAX),
		body: BODY[normalized],
		url: incidentNotificationUrl(normalized, incidentId),
	};
}
