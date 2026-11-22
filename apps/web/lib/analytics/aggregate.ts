import { type Severity, severityFor } from "@/lib/incidents/severity";

/**
 * Pure aggregation for the analytics page. Everything here works on plain
 * values so the metrics can be unit-tested without a database. Range filtering
 * and owner scope belong to the query in `app/[locale]/(dashboard)/analytics`.
 */

export const ANALYTICS_RANGES = [7, 14, 30] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = 7;

const DAY_MS = 86_400_000;

export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = Number(raw ?? "");
	return (ANALYTICS_RANGES as readonly number[]).includes(parsed)
		? (parsed as AnalyticsRange)
		: DEFAULT_ANALYTICS_RANGE;
}

/** Manila calendar day key, e.g. "2026-11-22". Manila has no DST. */
export function manilaDayKey(date: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

/** Manila hour of day, 0-23. */
export function manilaHour(date: Date): number {
	const hour = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Manila",
		hour: "2-digit",
		hourCycle: "h23",
	}).format(date);
	return Number.parseInt(hour, 10) % 24;
}

export interface AnalyticsWindow {
	/** First included instant: 00:00 Asia/Manila on the oldest day. */
	start: Date;
	end: Date;
	/** One 00:00 Asia/Manila instant per day in the range, oldest first. */
	days: Date[];
}

/**
 * The last `range` Manila calendar days, including today. Because Manila has no
 * daylight saving time, adding 24 h is exact and keeps every bucket aligned to
 * a local midnight.
 */
export function analyticsWindow(range: AnalyticsRange, now: Date): AnalyticsWindow {
	const start = new Date(
		new Date(`${manilaDayKey(now)}T00:00:00+08:00`).getTime() - (range - 1) * DAY_MS,
	);
	const days = Array.from(
		{ length: range },
		(_, index) => new Date(start.getTime() + index * DAY_MS),
	);
	return { start, end: now, days };
}

export interface DayCount {
	key: string;
	date: Date;
	count: number;
}

export function countByManilaDay(
	incidents: readonly { detectedAt: Date }[],
	days: readonly Date[],
): DayCount[] {
	const counts = new Map<string, number>();
	for (const incident of incidents) {
		const key = manilaDayKey(incident.detectedAt);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return days.map((date) => {
		const key = manilaDayKey(date);
		return { key, date, count: counts.get(key) ?? 0 };
	});
}

export interface HourCount {
	hour: number;
	count: number;
}

export function countByHour(incidents: readonly { detectedAt: Date }[]): HourCount[] {
	const counts = new Array<number>(24).fill(0);
	for (const incident of incidents) {
		const hour = manilaHour(incident.detectedAt);
		counts[hour] = (counts[hour] ?? 0) + 1;
	}
	return counts.map((count, hour) => ({ hour, count }));
}

export interface AnalyticsIncident {
	id: string;
	detectedAt: Date;
	status: string;
	resolvedAt: Date | null;
	peakAccelG: number;
	tiltDeg: number;
	vehicleId: string;
	vehicle: { plateNo: string };
}

const ACTIVE_STATUSES = ["SUSPECTED", "CONFIRMED", "ACKNOWLEDGED"] as const;

export function isActiveStatus(status: string): boolean {
	return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** A real crash is a resolved incident or one that is still open. */
export function isRealCrash(status: string): boolean {
	return status === "RESOLVED" || isActiveStatus(status);
}

export interface IncidentSummary {
	total: number;
	active: number;
	resolved: number;
	falseAlarms: number;
	cancelled: number;
	realCrashes: number;
}

export function summarizeIncidents(incidents: readonly AnalyticsIncident[]): IncidentSummary {
	let active = 0;
	let resolved = 0;
	let falseAlarms = 0;
	let cancelled = 0;
	let realCrashes = 0;

	for (const incident of incidents) {
		if (isActiveStatus(incident.status)) active += 1;
		else if (incident.status === "RESOLVED") resolved += 1;
		else if (incident.status === "FALSE_ALARM") falseAlarms += 1;
		else if (incident.status === "CANCELLED") cancelled += 1;
		if (isRealCrash(incident.status)) realCrashes += 1;
	}

	return { total: incidents.length, active, resolved, falseAlarms, cancelled, realCrashes };
}

export interface FalseAlarmRate {
	/** False alarms in the denominator's terms. */
	numerator: number;
	/** Resolved crashes + false alarms + still-open incidents. Cancelled is excluded. */
	denominator: number;
	rate: number | null;
}

export function falseAlarmRate(incidents: readonly AnalyticsIncident[]): FalseAlarmRate {
	const summary = summarizeIncidents(incidents);
	const denominator = summary.resolved + summary.falseAlarms + summary.active;
	return {
		numerator: summary.falseAlarms,
		denominator,
		rate: denominator > 0 ? summary.falseAlarms / denominator : null,
	};
}

export interface DurationSummary {
	averageMs: number | null;
	count: number;
	totalMs: number;
}

/** Ignores missing, non-finite and negative samples (negative means clock skew). */
export function averageDuration(samples: readonly (number | null | undefined)[]): DurationSummary {
	const valid = samples.filter(
		(sample): sample is number =>
			typeof sample === "number" && Number.isFinite(sample) && sample >= 0,
	);
	if (valid.length === 0) return { averageMs: null, count: 0, totalMs: 0 };
	const totalMs = valid.reduce((sum, sample) => sum + sample, 0);
	return { averageMs: totalMs / valid.length, count: valid.length, totalMs };
}

export function resolutionDurations(incidents: readonly AnalyticsIncident[]): number[] {
	const samples: number[] = [];
	for (const incident of incidents) {
		if (incident.status !== "RESOLVED" || !incident.resolvedAt) continue;
		const elapsedMs = incident.resolvedAt.getTime() - incident.detectedAt.getTime();
		if (elapsedMs >= 0) samples.push(elapsedMs);
	}
	return samples;
}

export interface AcknowledgementAudit {
	target: string | null;
	createdAt: Date;
	actorName?: string | null;
}

export type AcknowledgementIncident = Pick<
	AnalyticsIncident,
	"id" | "detectedAt" | "vehicleId" | "vehicle"
>;

export interface AcknowledgementSample {
	incidentId: string;
	vehicleId: string;
	plateNo: string;
	detectedAt: Date;
	elapsedMs: number;
	actorName: string | null;
}

/**
 * Pair `incident.acknowledged` audit rows with the incident they name. When an
 * incident has more than one acknowledgement row, the earliest one wins.
 */
export function acknowledgementSamples(
	audits: readonly AcknowledgementAudit[],
	incidents: readonly AcknowledgementIncident[],
): AcknowledgementSample[] {
	const incidentById = new Map(incidents.map((incident) => [incident.id, incident]));
	const earliest = new Map<string, { audit: AcknowledgementAudit; elapsedMs: number }>();

	for (const audit of audits) {
		if (!audit.target) continue;
		const incident = incidentById.get(audit.target);
		if (!incident) continue;
		const elapsedMs = audit.createdAt.getTime() - incident.detectedAt.getTime();
		if (elapsedMs < 0) continue;
		const current = earliest.get(incident.id);
		if (!current || audit.createdAt.getTime() < current.audit.createdAt.getTime()) {
			earliest.set(incident.id, { audit, elapsedMs });
		}
	}

	const samples: AcknowledgementSample[] = [];
	for (const [incidentId, entry] of earliest) {
		const incident = incidentById.get(incidentId);
		if (!incident) continue;
		samples.push({
			incidentId,
			vehicleId: incident.vehicleId,
			plateNo: incident.vehicle.plateNo,
			detectedAt: incident.detectedAt,
			elapsedMs: entry.elapsedMs,
			actorName: entry.audit.actorName ?? null,
		});
	}
	return samples;
}

function compareText(left: string, right: string): number {
	if (left === right) return 0;
	return left < right ? -1 : 1;
}

export function slowestResponses(
	samples: readonly AcknowledgementSample[],
	limit = 5,
): AcknowledgementSample[] {
	return [...samples]
		.sort(
			(left, right) =>
				right.elapsedMs - left.elapsedMs ||
				compareText(left.plateNo, right.plateNo) ||
				compareText(left.incidentId, right.incidentId),
		)
		.slice(0, limit);
}

export interface VehicleIncidentCount {
	vehicleId: string;
	plateNo: string;
	count: number;
}

export function topVehicles(
	incidents: readonly AnalyticsIncident[],
	limit = 5,
): VehicleIncidentCount[] {
	const byVehicle = new Map<string, VehicleIncidentCount>();
	for (const incident of incidents) {
		const entry = byVehicle.get(incident.vehicleId) ?? {
			vehicleId: incident.vehicleId,
			plateNo: incident.vehicle.plateNo,
			count: 0,
		};
		entry.count += 1;
		byVehicle.set(incident.vehicleId, entry);
	}
	return [...byVehicle.values()]
		.sort(
			(left, right) =>
				right.count - left.count ||
				compareText(left.plateNo, right.plateNo) ||
				compareText(left.vehicleId, right.vehicleId),
		)
		.slice(0, limit);
}

export const SEVERITY_ORDER: readonly Severity[] = ["critical", "high", "moderate", "low"];

export interface SeverityCount {
	severity: Severity;
	count: number;
}

export function severityDistribution(
	incidents: readonly Pick<AnalyticsIncident, "peakAccelG" | "tiltDeg">[],
): SeverityCount[] {
	const counts = new Map<Severity, number>();
	for (const incident of incidents) {
		const severity = severityFor(incident.peakAccelG, incident.tiltDeg);
		counts.set(severity, (counts.get(severity) ?? 0) + 1);
	}
	return SEVERITY_ORDER.map((severity) => ({ severity, count: counts.get(severity) ?? 0 }));
}

/** Compact duration for KPI values and table cells. Empty samples render as "—". */
export function formatDuration(ms: number | null | undefined): string {
	if (ms == null || !Number.isFinite(ms)) return "—";
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) return `${minutes}m ${seconds}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
