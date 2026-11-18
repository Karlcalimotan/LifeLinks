export type Severity = "critical" | "high" | "moderate" | "low";

/**
 * Severity is a presentation aid, not a gate. The device has already decided
 * to send the incident; the dashboard must never hide it because a threshold
 * says "low".
 */
export function severityFor(peakAccelG: number, tiltDeg: number): Severity {
	if (peakAccelG >= 4 || tiltDeg >= 75) return "critical";
	if (peakAccelG >= 3 || tiltDeg >= 60) return "high";
	if (peakAccelG >= 2.5 || tiltDeg >= 45) return "moderate";
	return "low";
}

export function severityLabel(severity: Severity): string {
	switch (severity) {
		case "critical":
			return "Critical";
		case "high":
			return "High";
		case "moderate":
			return "Moderate";
		default:
			return "Low";
	}
}
