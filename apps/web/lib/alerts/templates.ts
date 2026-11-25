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

/** A vehicle contact as the alert paths read it. */
export interface AlertContact {
	phone: string;
	email?: string | null;
	active?: boolean;
}

export const ALERT_PHONE_LIMIT = 10;
export const ALERT_EMAIL_LIMIT = 10;

/**
 * The tracker keeps two emergency numbers, so at most two vehicle contacts are
 * sent. The organisation list is the fallback when the vehicle has none.
 */
export const DEVICE_ALERT_PHONE_LIMIT = 2;

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

function unique<T>(values: readonly T[], key: (value: T) => string): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const value of values) {
		const marker = key(value);
		if (seen.has(marker)) continue;
		seen.add(marker);
		result.push(value);
	}
	return result;
}

/** Two spellings of one number (`0917...` and `+63917...`) count as one target. */
function phoneKey(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	// The console accepts the local PH form and the international form for the
	// same number. Compare them on the international digits without changing
	// what is stored or sent.
	if (digits.length === 11 && digits.startsWith("0")) return `63${digits.slice(1)}`;
	return digits;
}

/**
 * Merge the active contacts of one vehicle ahead of the organisation list.
 * Contacts are the people the owner registered for this car, so they are
 * alerted first; the organisation phones and emails stay as the fleet
 * fallback. Order is stable, duplicates are removed, and each channel is
 * capped so one incident cannot fan out without bound.
 */
export function alertTargetsForVehicle(
	settings: { alertPhones: unknown; alertEmails: unknown },
	contacts: readonly AlertContact[],
): AlertTargets {
	const active = contacts.filter((contact) => contact.active !== false);

	const contactPhones = unique(
		active
			.map((contact) => normalizePhone(contact.phone))
			.filter((phone): phone is string => phone != null),
		(phone) => phoneKey(phone),
	);
	const contactEmails = unique(
		active
			.map((contact) => contact.email?.trim().toLowerCase() ?? "")
			.filter((email) => email.includes("@")),
		(email) => email,
	);

	const org = alertTargetsFromSettings(settings);

	return {
		phones: unique([...contactPhones, ...org.phones], (phone) => phoneKey(phone)).slice(
			0,
			ALERT_PHONE_LIMIT,
		),
		emails: unique(
			[...contactEmails, ...org.emails.map((email) => email.toLowerCase())],
			(email) => email,
		).slice(0, ALERT_EMAIL_LIMIT),
	};
}

/**
 * The tracker's SMS fallback list. Prefer the vehicle's active contacts, at
 * most two because the firmware keeps two slots; fall back to the organisation
 * phones when the vehicle has none. Returning the organisation list unchanged
 * keeps the existing payload behaviour for installations without contacts.
 */
export function alertPhonesForDevice(
	contacts: readonly AlertContact[],
	orgPhones: readonly string[],
): string[] {
	const contactPhones = unique(
		contacts
			.filter((contact) => contact.active !== false)
			.map((contact) => normalizePhone(contact.phone))
			.filter((phone): phone is string => phone != null),
		(phone) => phoneKey(phone),
	).slice(0, DEVICE_ALERT_PHONE_LIMIT);

	if (contactPhones.length > 0) return contactPhones;
	return [...orgPhones];
}
