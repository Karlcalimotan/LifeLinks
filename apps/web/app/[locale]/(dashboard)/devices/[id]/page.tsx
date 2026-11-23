import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { EditDeviceForm } from "@/components/devices/edit-device-form";
import { RotateTokenButton } from "@/components/devices/rotate-token-button";
import { ApprovalBadge, DeviceStatusBadge } from "@/components/domain/badges";
import { Button } from "@/components/ui/button";
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
import {
	approveDeviceAction,
	commandDeviceAction,
	deleteDeviceAction,
	rejectDeviceAction,
} from "@/lib/actions/devices";
import { canAdminister, requireRole } from "@/lib/auth/session";
import { deviceConnectionState, gpsAgeSeconds } from "@/lib/device/status";
import { buildFirmwareConfig } from "@/lib/firmware/config";
import prisma from "@/lib/prisma";
import { getOrgSettings, settingsToFirmwareValues } from "@/lib/settings/org";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { Radio, Satellite, Terminal } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const COMMANDS: ReadonlyArray<{ kind: string; label: string; confirmKey?: "confirmDisarm" }> = [
	{ kind: "LOCATE", label: "Locate now" },
	{ kind: "TEST_ALERT", label: "Test alert" },
	{ kind: "ARM", label: "Arm" },
	{ kind: "DISARM", label: "Disarm", confirmKey: "confirmDisarm" },
];

export default async function DeviceDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string; id: string }>;
	searchParams: Promise<{
		command?: string;
		error?: string;
		approved?: string;
		rejected?: string;
	}>;
}) {
	const { locale, id } = await params;
	const { command, error, approved, rejected } = await searchParams;
	const current = await requireRole("ADMIN");
	const t = await getTranslations({ locale, namespace: "devices" });
	const common = await getTranslations({ locale, namespace: "common" });

	const [device, vehicles] = await Promise.all([
		prisma.trackerDevice.findFirst({
			where: { id, orgId: current.org.id },
			include: {
				vehicle: true,
				commands: { orderBy: { createdAt: "desc" }, take: 10 },
				events: { orderBy: { createdAt: "desc" }, take: 20 },
			},
		}),
		prisma.vehicle.findMany({
			where: { orgId: current.org.id },
			orderBy: { plateNo: "asc" },
			select: { id: true, plateNo: true, make: true, model: true },
		}),
	]);
	if (!device) notFound();

	const settings = await getOrgSettings(current.org.id);
	const config = buildFirmwareConfig(settingsToFirmwareValues(settings));
	const state = deviceConnectionState(device.lastSeenAt);

	return (
		<>
			<PageHeader
				title={`${device.label} (${device.mac})`}
				subtitle={
					device.vehicle
						? `${device.vehicle.plateNo}: ${device.vehicle.make} ${device.vehicle.model}`
						: "Unassigned tracker"
				}
			/>

			{command === "queued" ? (
				<p className="mb-4 rounded border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-xs text-clear-300">
					Command queued. The tracker picks it up on its next poll.
				</p>
			) : null}
			{error ? (
				<p className="mb-4 rounded border border-alarm-500/30 bg-alarm-500/10 px-3 py-2 text-xs text-alarm-300">
					{error === "forbidden"
						? "Your role cannot send commands."
						: "Command could not be queued."}
				</p>
			) : null}
			{approved === "1" ? (
				<p className="mb-4 rounded border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-xs text-clear-300">
					Tracker approved.
				</p>
			) : null}
			{rejected === "1" ? (
				<p className="mb-4 rounded border border-caution-400/30 bg-caution-400/10 px-3 py-2 text-xs text-caution-300">
					Tracker rejected.
				</p>
			) : null}

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<DeviceStatusBadge state={state} />
				<ApprovalBadge status={device.approvalStatus} />
				{device.vehicle ? (
					<Link href={`/vehicles/${device.vehicle.id}`} className="text-xs text-signal-400">
						{device.vehicle.plateNo}
					</Link>
				) : null}
			</div>

			{device.approvalStatus === "PENDING" && canAdminister(current.role) ? (
				<Card className="mb-6 border-caution-400/30">
					<CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
						<p className="text-sm text-caution-300">
							This tracker is waiting for approval. It cannot send data until approved.
						</p>
						<div className="flex gap-2">
							<form action={approveDeviceAction}>
								<input type="hidden" name="locale" value={locale} />
								<input type="hidden" name="deviceId" value={device.id} />
								<ConfirmSubmit
									message="Approve this tracker? It will start sending data."
									confirmLabel="Approve"
									cancelLabel={common("cancel")}
								>
									Approve
								</ConfirmSubmit>
							</form>
							<form action={rejectDeviceAction}>
								<input type="hidden" name="locale" value={locale} />
								<input type="hidden" name="deviceId" value={device.id} />
								<ConfirmSubmit
									variant="outline"
									message="Reject this tracker? It will stop sending data until approved again."
									confirmLabel="Reject"
									cancelLabel={common("cancel")}
								>
									Reject
								</ConfirmSubmit>
							</form>
						</div>
					</CardContent>
				</Card>
			) : null}

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Edit tracker</CardTitle>
				</CardHeader>
				<CardContent>
					<EditDeviceForm
						locale={locale}
						device={{
							id: device.id,
							label: device.label,
							mac: device.mac,
							vehicleId: device.vehicleId,
						}}
						vehicles={vehicles.map((vehicle) => ({
							id: vehicle.id,
							label: `${vehicle.plateNo}: ${vehicle.make} ${vehicle.model}`,
						}))}
					/>
				</CardContent>
			</Card>

			<div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>Connectivity</CardTitle>
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-3 text-xs">
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="text-meta font-medium text-fog-500">Last seen</p>
							<p className="mt-1 text-sm text-fog-100">
								{formatDateTime(device.lastSeenAt, locale)}
							</p>
							<p className="text-meta text-fog-500">{formatRelative(device.lastSeenAt)}</p>
						</div>
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="text-meta font-medium text-fog-500">Battery</p>
							<p className="mt-1 text-sm text-fog-100">
								{device.batteryV != null ? `${device.batteryV.toFixed(1)} V` : "—"}
							</p>
						</div>
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="text-meta font-medium text-fog-500">Signal</p>
							<p className="mt-1 flex items-center gap-2 text-sm text-fog-100">
								<Radio className="size-3.5 text-rescue-400" />
								{device.rssiDbm != null ? `${device.rssiDbm} dBm` : "—"}
							</p>
						</div>
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="text-meta font-medium text-fog-500">Satellites</p>
							<p className="mt-1 flex items-center gap-2 text-sm text-fog-100">
								<Satellite className="size-3.5 text-rescue-400" />
								{device.satellites ?? "—"}
							</p>
						</div>
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="text-meta font-medium text-fog-500">GPS age</p>
							<p className="mt-1 text-sm text-fog-100">
								{gpsAgeSeconds(device.lastFixAt) != null
									? `${gpsAgeSeconds(device.lastFixAt)}s`
									: "—"}
							</p>
						</div>
						<div className="rounded border border-ink-700 bg-ink-950/40 p-3">
							<p className="text-meta font-medium text-fog-500">Config revision</p>
							<p className="mt-1 text-sm text-fog-100">{device.configRev ?? "—"}</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex-row items-center justify-between">
						<CardTitle>{t("tokenTitle")}</CardTitle>
						<RotateTokenButton deviceId={device.id} label={device.label} locale={locale} />
					</CardHeader>
					<CardContent>
						<p className="text-xs leading-relaxed text-fog-500">{t("tokenDescription")}</p>
						<p className="mt-3 text-meta text-fog-500">
							Firmware {device.firmwareVersion ?? "unknown"} / variant{" "}
							{device.hwVariant ?? "unknown"}
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("commands")}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{canAdminister(current.role) ? (
							<div className="flex flex-wrap gap-2">
								{COMMANDS.map((entry) => (
									<form key={entry.kind} action={commandDeviceAction}>
										<input type="hidden" name="locale" value={locale} />
										<input type="hidden" name="deviceId" value={device.id} />
										<input type="hidden" name="kind" value={entry.kind} />
										{entry.confirmKey ? (
											<ConfirmSubmit
												variant="danger"
												message={t(entry.confirmKey)}
												confirmLabel={t("disarm")}
												cancelLabel={common("cancel")}
											>
												{t("disarm")}
											</ConfirmSubmit>
										) : (
											<Button type="submit" size="sm" variant="secondary">
												{entry.label}
											</Button>
										)}
									</form>
								))}
							</div>
						) : (
							<p className="text-xs text-fog-500">Your role cannot send commands.</p>
						)}

						{device.commands.length === 0 ? (
							<EmptyState title="No commands yet" />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Kind</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Queued</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{device.commands.map((command) => (
										<TableRow key={command.id}>
											<TableCell>{command.kind}</TableCell>
											<TableCell className="text-xs text-fog-500">
												{command.status.toLowerCase()}
											</TableCell>
											<TableCell className="text-xs text-fog-500">
												{formatRelative(command.createdAt)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Device configuration</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 gap-2 text-xs">
							{Object.entries(config)
								.filter(([key]) => key !== "version" && key !== "rev")
								.map(([key, value]) => (
									<div
										key={key}
										className="flex items-center justify-between rounded border border-ink-700 bg-ink-950/40 px-3 py-2"
									>
										<span className="text-fog-500">{key}</span>
										<span className="font-mono text-fog-100">{String(value)}</span>
									</div>
								))}
						</div>
						<p className="mt-3 text-meta text-fog-500">
							Config rev {config.rev} / version {config.version}
						</p>
					</CardContent>
				</Card>
			</div>

			<Card className="mt-6">
				<CardHeader>
					<CardTitle>{t("eventLog")}</CardTitle>
				</CardHeader>
				<CardContent>
					{device.events.length === 0 ? (
						<EmptyState title={t("noEvents")} />
					) : (
						<div className="flex flex-col gap-2">
							{device.events.map((event) => (
								<div
									key={event.id}
									className="flex items-start gap-3 rounded border border-ink-700/70 bg-ink-950/30 px-3 py-2"
								>
									<Terminal className="mt-0.5 size-3.5 text-fog-500" />
									<div className="min-w-0">
										<p className="text-xs font-medium text-fog-300">
											{event.type.replaceAll("_", " ").toLowerCase()}
										</p>
										<p className="text-meta text-fog-500">
											{formatDateTime(event.createdAt, locale)}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card className="mt-6 border-alarm-500/30">
				<CardHeader>
					<CardTitle>Danger zone</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center justify-between gap-3">
					<p className="max-w-xl text-xs leading-relaxed text-fog-500">
						Deleting a tracker removes its trips, samples and incidents. This cannot be undone.
					</p>
					<form action={deleteDeviceAction}>
						<input type="hidden" name="locale" value={locale} />
						<input type="hidden" name="deviceId" value={device.id} />
						<ConfirmSubmit
							variant="danger"
							message={`Delete ${device.label} (${device.mac})? This removes its trips, samples and incidents and cannot be undone.`}
							confirmText={device.mac}
							confirmLabel="Delete tracker"
							cancelLabel={common("cancel")}
						>
							Delete tracker
						</ConfirmSubmit>
					</form>
				</CardContent>
			</Card>
		</>
	);
}
