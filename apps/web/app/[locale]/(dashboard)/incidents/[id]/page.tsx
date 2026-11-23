import { IncidentStatusBadge, SeverityBadge } from "@/components/domain/badges";
import { EvidenceChart, type EvidencePoint } from "@/components/incidents/evidence-chart";
import { IncidentActions } from "@/components/incidents/incident-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/session";
import { mapLink } from "@/lib/geo";
import {
	acknowledgementRequiredBeforeResolve,
	canResolveWithoutTracker,
	readBureauAckState,
} from "@/lib/incidents/bureau-ack";
import { readCancelAlertState } from "@/lib/incidents/cancel-alert";
import {
	incidentAuditLabelKey,
	mergeIncidentTimeline,
	timelineHasCancellation,
} from "@/lib/incidents/timeline";
import prisma from "@/lib/prisma";
import { isCancelActionFocus } from "@/lib/push/payload";
import { formatDateTime, telHref } from "@/lib/utils";
import { ExternalLink, MapPin, Phone, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const STATUS_LABEL_KEYS: Record<string, string> = {
	SUSPECTED: "statusSuspected",
	CONFIRMED: "statusConfirmed",
	ACKNOWLEDGED: "statusAcknowledged",
	RESOLVED: "statusResolved",
	CANCELLED: "statusCancelled",
	FALSE_ALARM: "statusFalseAlarm",
};

interface EvidenceShape {
	samples?: Array<{ t?: number; accel_g?: number; tilt_deg?: number }>;
}

function readEvidence(value: unknown): EvidencePoint[] {
	const evidence = (value ?? {}) as EvidenceShape;
	if (!Array.isArray(evidence.samples)) return [];
	return evidence.samples
		.filter((sample) => typeof sample.t === "number")
		.map((sample) => ({
			t: sample.t as number,
			accelG: typeof sample.accel_g === "number" ? sample.accel_g : undefined,
			tiltDeg: typeof sample.tilt_deg === "number" ? sample.tilt_deg : undefined,
		}));
}

export default async function IncidentDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string; id: string }>;
	searchParams: Promise<{
		updated?: string;
		error?: string;
		cancel?: string;
		ack?: string;
		action?: string;
	}>;
}) {
	const { locale, id } = await params;
	const { updated, error, cancel, ack, action } = await searchParams;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "incidents" });

	const ownership =
		current.role === "USER" ? { vehicle: { is: { ownerId: current.user.id } } } : {};
	const incident = await prisma.impactEvent.findFirst({
		where: { id, orgId: current.org.id, ...ownership },
		// Explicit fields only: the incident detail never needs the tracker's
		// token hash or any other secret-bearing row.
		include: {
			vehicle: { select: { plateNo: true, driverName: true, driverPhone: true } },
			device: { select: { label: true } },
			alerts: {
				select: { id: true, channel: true, target: true, status: true, attempts: true },
				orderBy: { createdAt: "asc" },
			},
		},
	});
	if (!incident) notFound();

	const events = await prisma.deviceStateEvent.findMany({
		where: {
			deviceId: incident.deviceId,
			createdAt: {
				gte: new Date(incident.detectedAt.getTime() - 10 * 60 * 1000),
				lte: new Date(incident.detectedAt.getTime() + 30 * 60 * 1000),
			},
		},
		orderBy: { createdAt: "asc" },
	});

	const auditRows = await prisma.auditLog.findMany({
		where: {
			orgId: current.org.id,
			target: incident.id,
			action: { startsWith: "incident." },
		},
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			action: true,
			createdAt: true,
			actor: { select: { name: true } },
		},
	});

	const cancelCommands = await prisma.deviceCommand.findMany({
		where: {
			impactEventId: incident.id,
			kind: "CANCEL_ALERT",
		},
		orderBy: { createdAt: "desc" },
		take: 20,
		select: {
			id: true,
			kind: true,
			status: true,
			payload: true,
			impactEventId: true,
			createdAt: true,
			expiresAt: true,
		},
	});
	const now = new Date();
	const cancelAlert = readCancelAlertState({
		incidentId: incident.id,
		status: incident.status,
		cancelRequestedAt: incident.cancelRequestedAt,
		commands: cancelCommands,
		now,
	});

	const ackCommands = await prisma.deviceCommand.findMany({
		where: {
			impactEventId: incident.id,
			kind: "ACK_INCIDENT",
		},
		orderBy: { createdAt: "desc" },
		take: 20,
		select: {
			id: true,
			kind: true,
			status: true,
			payload: true,
			impactEventId: true,
			createdAt: true,
			expiresAt: true,
		},
	});
	const bureauAck = readBureauAckState({
		incidentId: incident.id,
		status: incident.status,
		ackRequestedAt: incident.ackRequestedAt,
		commands: ackCommands,
		now,
	});
	const resolveWithoutTrackerAvailable = canResolveWithoutTracker({
		status: incident.status,
		deviceBacked: Boolean(incident.device),
		ack: bureauAck,
	});

	const timeline = mergeIncidentTimeline(
		auditRows.map((row) => ({
			id: row.id,
			action: row.action,
			createdAt: row.createdAt,
			actorName: row.actor?.name ?? null,
		})),
		events.map((event) => ({ id: event.id, type: event.type, createdAt: event.createdAt })),
	);
	const cancellationInTimeline = timelineHasCancellation(timeline);
	const driverPhone = telHref(incident.vehicle.driverPhone);
	const statusLabel = t(STATUS_LABEL_KEYS[incident.status] ?? "statusSuspected");
	const points = readEvidence(incident.evidence);
	const hasFix = incident.lat != null && incident.lng != null;

	return (
		<>
			<PageHeader
				title={`${incident.vehicle.plateNo} · ${statusLabel}`}
				subtitle={`${t("detailTitle")} · ${formatDateTime(incident.detectedAt, locale)}`}
				actions={
					hasFix ? (
						<a
							href={mapLink(incident.lat as number, incident.lng as number)}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-8 items-center gap-1.5 rounded border border-ink-600 px-3 text-xs text-fog-300 hover:border-ink-600 hover:text-fog-50"
						>
							<ExternalLink className="size-3.5" aria-hidden="true" />
							{t("openInMaps")}
						</a>
					) : null
				}
			/>

			<div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-body">
				<span className="inline-flex items-center gap-1.5 text-fog-300">
					<UserRound className="size-4 text-fog-500" aria-hidden="true" />
					{incident.vehicle.driverName ?? t("driverNotRecorded")}
				</span>
				{driverPhone ? (
					<a
						href={driverPhone}
						className="inline-flex items-center gap-1.5 text-signal-400 underline-offset-2 hover:text-signal-300 hover:underline"
					>
						<Phone className="size-3.5" aria-hidden="true" />
						{t("callDriver")}
					</a>
				) : null}
			</div>

			{updated ? (
				<p className="mb-4 rounded border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-xs text-clear-300">
					{t("statusUpdated")}
				</p>
			) : null}
			{cancel === "requested" && cancelAlert.state === "waiting" ? (
				<p className="mb-4 rounded border border-caution-400/30 bg-caution-400/10 px-3 py-2 text-xs text-caution-300">
					{t("cancelRequested")}
				</p>
			) : null}
			{ack === "requested" && bureauAck.state === "waiting" ? (
				<p className="mb-4 rounded border border-caution-400/30 bg-caution-400/10 px-3 py-2 text-xs text-caution-300">
					{t("ackRequested")}
				</p>
			) : null}
			{error ? (
				<p className="mb-4 rounded border border-alarm-500/30 bg-alarm-500/10 px-3 py-2 text-xs text-alarm-300">
					{error === "forbidden"
						? "Your role cannot change incidents."
						: error === "tracker_required"
							? t("errorTrackerRequired")
							: error === "ack_required"
								? t("errorAckRequired")
								: error === "ack_not_dispatched"
									? t("errorAckNotDispatched")
									: error === "ack_recovery_unavailable"
										? t("errorAckRecoveryUnavailable")
										: error === "ack_confirmation_required"
											? t("errorAckConfirmationRequired")
											: error === "command_conflict"
												? t("errorCommandConflict")
												: "That status transition is not allowed."}
				</p>
			) : null}

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<IncidentStatusBadge status={incident.status} />
				<SeverityBadge peakAccelG={incident.peakAccelG} tiltDeg={incident.tiltDeg} />
				<Link
					href={`/vehicles/${incident.vehicleId}`}
					className="text-xs text-signal-400 hover:text-signal-300"
				>
					{incident.vehicle.plateNo}
				</Link>
				<Link
					href={`/devices/${incident.deviceId}`}
					className="text-xs text-fog-500 hover:text-fog-100"
				>
					{incident.device.label}
				</Link>
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("evidence")}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<EvidenceChart points={points} />
						<div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-meta font-medium text-fog-500">{t("peakAccel")}</p>
								<p className="mt-1 text-sm text-fog-100">{incident.peakAccelG.toFixed(2)} g</p>
							</div>
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-meta font-medium text-fog-500">{t("tilt")}</p>
								<p className="mt-1 text-sm text-fog-100">{Math.round(incident.tiltDeg)}°</p>
							</div>
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-meta font-medium text-fog-500">{t("vibration")}</p>
								<p className="mt-1 text-sm text-fog-100">{incident.vibrationCount}</p>
							</div>
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-meta font-medium text-fog-500">{t("speed")}</p>
								<p className="mt-1 text-sm text-fog-100">
									{incident.speedKph != null ? `${Math.round(incident.speedKph)} kph` : "—"}
								</p>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-3 text-xs text-fog-500">
							{hasFix ? (
								<span className="inline-flex items-center gap-1.5">
									<MapPin className="size-3.5 text-rescue-400" />
									{incident.lat?.toFixed(5)}, {incident.lng?.toFixed(5)}
									{incident.gpsAgeS != null ? ` / fix ${incident.gpsAgeS}s old` : ""}
								</span>
							) : (
								<span>No GPS fix in the incident payload.</span>
							)}
							<span className="text-fog-500">/</span>
							<span>
								{t("incidentId")}: {incident.id}
							</span>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("timeline")}</CardTitle>
					</CardHeader>
					<CardContent>
						<ol className="relative flex flex-col gap-4 border-l border-ink-700 pl-4">
							<li className="relative">
								<span className="absolute -left-[21px] top-1 size-2 rounded-full bg-alarm-400" />
								<p className="text-xs font-medium text-fog-100">{t("timelineDetected")}</p>
								<p className="text-meta text-fog-500">
									{formatDateTime(incident.detectedAt, locale)}
								</p>
							</li>
							{incident.cancelDeadline ? (
								<li className="relative">
									<span className="absolute -left-[21px] top-1 size-2 rounded-full bg-caution-400" />
									<p className="text-xs font-medium text-fog-100">{t("timelineCancelWindow")}</p>
									<p className="text-meta text-fog-500">
										{formatDateTime(incident.cancelDeadline, locale)}
									</p>
								</li>
							) : null}
							{incident.cancelledAt && !cancellationInTimeline ? (
								<li className="relative">
									<span className="absolute -left-[21px] top-1 size-2 rounded-full bg-fog-500" />
									<p className="text-xs font-medium text-fog-100">{t("timelineCancelled")}</p>
									<p className="text-meta text-fog-500">
										{formatDateTime(incident.cancelledAt, locale)}
									</p>
								</li>
							) : null}
							{timeline.map((entry) => {
								const label =
									entry.kind === "audit"
										? t(incidentAuditLabelKey(entry.action))
										: entry.type.replaceAll("_", " ").toLowerCase();
								const actor =
									entry.kind === "audit" && entry.actorName
										? t("timelineActor", { name: entry.actorName })
										: null;
								return (
									<li key={entry.key} className="relative">
										<span
											className={`absolute -left-[21px] top-1 size-2 rounded-full ${
												entry.kind === "audit" ? "bg-rescue-400" : "bg-fog-500"
											}`}
										/>
										<p className="text-xs font-medium text-fog-100">{label}</p>
										<p className="text-meta text-fog-500">
											{formatDateTime(entry.at, locale)}
											{actor ? <span className="text-fog-400"> · {actor}</span> : null}
										</p>
									</li>
								);
							})}
						</ol>
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("deliveredTo")}</CardTitle>
					</CardHeader>
					<CardContent>
						{incident.alerts.length === 0 ? (
							<EmptyState title="No alert targets were configured" />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Channel</TableHead>
										<TableHead>Target</TableHead>
										<TableHead>{t("status")}</TableHead>
										<TableHead>Attempts</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{incident.alerts.map((alert) => (
										<TableRow key={alert.id}>
											<TableCell>{alert.channel}</TableCell>
											<TableCell className="text-fog-100">{alert.target}</TableCell>
											<TableCell className="text-xs capitalize text-fog-500">
												{alert.status.toLowerCase()}
											</TableCell>
											<TableCell className="text-xs text-fog-500">{alert.attempts}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("actions")}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{incident.resolution ? (
							<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
								<p className="text-meta font-medium text-fog-500">{t("resolution")}</p>
								<p className="mt-1 text-xs text-fog-300">{incident.resolution}</p>
							</div>
						) : null}
						<IncidentActions
							incidentId={incident.id}
							locale={locale}
							status={incident.status}
							role={current.role}
							permissions={current.permissions}
							cancelAlert={cancelAlert}
							bureauAck={bureauAck}
							acknowledgementRequired={acknowledgementRequiredBeforeResolve({
								status: incident.status,
								deviceBacked: Boolean(incident.device),
							})}
							deviceBacked={Boolean(incident.device)}
							resolveWithoutTrackerAvailable={resolveWithoutTrackerAvailable}
							focusCancel={isCancelActionFocus(action)}
						/>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
