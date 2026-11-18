import { Badge } from "@/components/ui/badge";
import { type DeviceConnectionState, connectionLabel } from "@/lib/device/status";
import { severityFor, severityLabel } from "@/lib/incidents/severity";

const incidentTones: Record<string, "danger" | "warning" | "success" | "muted" | "info"> = {
	SUSPECTED: "warning",
	CONFIRMED: "danger",
	ACKNOWLEDGED: "info",
	RESOLVED: "success",
	CANCELLED: "muted",
	FALSE_ALARM: "muted",
};

export function IncidentStatusBadge({ status }: { status: string }) {
	return (
		<Badge tone={incidentTones[status] ?? "neutral"}>
			{status.replaceAll("_", " ").toLowerCase()}
		</Badge>
	);
}

export function SeverityBadge({
	peakAccelG,
	tiltDeg,
}: {
	peakAccelG: number;
	tiltDeg: number;
}) {
	const severity = severityFor(peakAccelG, tiltDeg);
	const tone =
		severity === "critical"
			? "danger"
			: severity === "high"
				? "warning"
				: severity === "moderate"
					? "info"
					: "muted";
	return <Badge tone={tone}>{severityLabel(severity)}</Badge>;
}

const vehicleTones: Record<string, "success" | "warning" | "muted"> = {
	ACTIVE: "success",
	MAINTENANCE: "warning",
	RETIRED: "muted",
};

export function VehicleStatusBadge({ status }: { status: string }) {
	return <Badge tone={vehicleTones[status] ?? "neutral"}>{status.toLowerCase()}</Badge>;
}

const connectionTones: Record<DeviceConnectionState, "success" | "warning" | "danger" | "muted"> = {
	online: "success",
	weak: "warning",
	offline: "danger",
	unknown: "muted",
};

export function DeviceStatusBadge({ state }: { state: DeviceConnectionState }) {
	return <Badge tone={connectionTones[state]}>{connectionLabel(state)}</Badge>;
}

const approvalTones: Record<string, "success" | "warning" | "danger" | "muted"> = {
	APPROVED: "success",
	PENDING: "warning",
	REJECTED: "danger",
	SUSPENDED: "muted",
};

export function ApprovalBadge({ status }: { status: string }) {
	return <Badge tone={approvalTones[status] ?? "neutral"}>{status.toLowerCase()}</Badge>;
}
