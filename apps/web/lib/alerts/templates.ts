/**
 * SMS is the primary emergency channel because it survives a backend outage.
 * Keep the body short, unambiguous, and useful to a person who is not looking
 * at the dashboard.
 */

export interface SmsIncidentInput {
	plateNo: string;
	lat?: number | null;
	lng?: number | null;
	gpsAgeS?: number | null;
	speedKph?: number | null;
	detectedAt: Date;
	callbackNumber?: string | null;
}

export function normalizePhone(input: string): string | null {
	const trimmed = input.trim();
	const digits = trimmed.replace(/[^\d]/g, "");
	if (digits.length < 10 || digits.length > 15) return null;
	return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function buildSmsBody(input: SmsIncidentInput): string {
	const location =
		input.lat != null && input.lng != null
			? `${input.lat.toFixed(5)},${input.lng.toFixed(5)}`
			: "location unavailable";
	const age = input.gpsAgeS != null ? ` (fix ${input.gpsAgeS}s old)` : "";
	const speed = input.speedKph != null ? ` ${Math.round(input.speedKph)}kph` : "";
	const callback = input.callbackNumber ? ` Call ${input.callbackNumber}.` : "";
	const time = new Intl.DateTimeFormat("en-PH", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Asia/Manila",
	}).format(input.detectedAt);

	return `LIFELINK SOS ${input.plateNo}${speed} at ${location}${age} ${time}.${callback}`.slice(
		0,
		320,
	);
}

export interface AlertTargets {
	phones: string[];
	emails: string[];
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function alertTargetsFromSettings(settings: {
	alertPhones: unknown;
	alertEmails: unknown;
}): AlertTargets {
	return {
		phones: readStringArray(settings.alertPhones)
			.map(normalizePhone)
			.filter((phone): phone is string => phone != null),
		emails: readStringArray(settings.alertEmails).filter((email) => email.includes("@")),
	};
}
