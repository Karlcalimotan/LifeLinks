import { Badge } from "@/components/ui/badge";

const tones: Record<string, "warning" | "success" | "danger" | "info" | "muted"> = {
	QUEUED: "warning",
	SENT: "success",
	FAILED: "danger",
	ACKNOWLEDGED: "info",
};

export function AlertStatusBadge({ status, label }: { status: string; label: string }) {
	return <Badge tone={tones[status] ?? "muted"}>{label}</Badge>;
}
