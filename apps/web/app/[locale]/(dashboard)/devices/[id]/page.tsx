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
	rejectDeviceAction,
} from "@/lib/actions/devices";
import { canAdminister, canWrite, requireUser } from "@/lib/auth/session";
import { deviceConnectionState, gpsAgeSeconds } from "@/lib/device/status";
import { buildFirmwareConfig } from "@/lib/firmware/config";
import prisma from "@/lib/prisma";
import { getOrgSettings, settingsToFirmwareValues } from "@/lib/settings/org";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { Radio, Satellite, Terminal } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const COMMANDS = [
	{ kind: "LOCATE", label: "Locate now" },
	{ kind: "TEST_ALERT", label: "Test alert" },
	{ kind: "ARM", label: "Arm" },
	{ kind: "DISARM", label: "Disarm" },
] as const;

export default async function DeviceDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string; id: string }>;
	searchParams: Promise<{ command?: string; error?: string }>;
}) {
	const { locale, id } = await params;
	const { command, error } = await searchParams;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "devices" });

	const device = await prisma.trackerDevice.findFirst({
		where: { id, orgId: current.org.id },
		include: {
			vehicle: true,
			commands: { orderBy: { createdAt: "desc" }, take: 10 },
			events: { orderBy: { createdAt: "desc" }, take: 20 },
		},
	});
	if (!device) notFound();

	const settings = await getOrgSettings(current.org.id);
	const config = buildFirmwareConfig(settingsToFirmwareValues(settings));
	const state = deviceConnectionState(device.lastSeenAt);

	return (
		<>
			<PageHeader
				title={`${device.label} · ${device.mac}`}
				subtitle={
					device.vehicle
						? `${device.vehicle.plateNo} · ${device.vehicle.make} ${device.vehicle.model}`
						: "Unassigned tracker"
				}
			/>

			{command === "queued" ? (
				<p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
					Command queued. The tracker picks it up on its next poll.
				</p>
			) : null}
			{error ? (
				<p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
					{error === "forbidden"
						? "Your role cannot send commands."
						: "Command could not be queued."}
				</p>
			) : null}

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<DeviceStatusBadge state={state} />
				<ApprovalBadge status={device.approvalStatus} />
				{device.vehicle ? (
					<Link href={`/vehicles/${device.vehicle.id}`} className="text-xs text-brand-400">
						{device.vehicle.plateNo}
					</Link>
				) : null}
			</div>

			{device.approvalStatus === "PENDING" && canAdminister(current.role) ? (
				<Card className="mb-6 border-amber-500/30">
					<CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
						<p className="text-sm text-amber-200">
							This tracker is waiting for approval. It cannot send data until approved.
						</p>
						<div className="flex gap-2">
							<form action={approveDeviceAction}>
								<input type="hidden" name="locale" value={locale} />
								<input type="hidden" name="deviceId" value={device.id} />
								<Button type="submit" size="sm">
									Approve
								</Button>
							</form>
							<form action={rejectDeviceAction}>
								<input type="hidden" name="locale" value={locale} />
								<input type="hidden" name="deviceId" value={device.id} />
								<Button type="submit" size="sm" variant="outline">
									Reject
								</Button>
							</form>
						</div>
					</CardContent>
				</Card>
			) : null}

			<div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>Connectivity</CardTitle>
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-3 text-xs">
						<div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
							<p className="text-[10px] uppercase tracking-wider text-slate-500">Last seen</p>
							<p className="mt-1 text-sm text-slate-200">
								{formatDateTime(device.lastSeenAt, locale)}
							</p>
							<p className="text-[10px] text-slate-500">{formatRelative(device.lastSeenAt)}</p>
						</div>
						<div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
							<p className="text-[10px] uppercase tracking-wider text-slate-500">Battery</p>
							<p className="mt-1 text-sm text-slate-200">
								{device.batteryV != null ? `${device.batteryV.toFixed(1)} V` : "—"}
							</p>
						</div>
						<div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
							<p className="text-[10px] uppercase tracking-wider text-slate-500">Signal</p>
							<p className="mt-1 flex items-center gap-2 text-sm text-slate-200">
								<Radio className="size-3.5 text-cyan-400" />
								{device.rssiDbm != null ? `${device.rssiDbm} dBm` : "—"}
							</p>
						</div>
						<div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
							<p className="text-[10px] uppercase tracking-wider text-slate-500">Satellites</p>
							<p className="mt-1 flex items-center gap-2 text-sm text-slate-200">
								<Satellite className="size-3.5 text-cyan-400" />
								{device.satellites ?? "—"}
							</p>
						</div>
						<div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
							<p className="text-[10px] uppercase tracking-wider text-slate-500">GPS age</p>
							<p className="mt-1 text-sm text-slate-200">
								{gpsAgeSeconds(device.lastFixAt) != null
									? `${gpsAgeSeconds(device.lastFixAt)}s`
									: "—"}
							</p>
						</div>
						<div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
							<p className="text-[10px] uppercase tracking-wider text-slate-500">Config revision</p>
							<p className="mt-1 text-sm text-slate-200">{device.configRev ?? "—"}</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex-row items-center justify-between">
						<CardTitle>{t("tokenTitle")}</CardTitle>
						<RotateTokenButton deviceId={device.id} locale={locale} />
					</CardHeader>
					<CardContent>
						<p className="text-xs leading-relaxed text-slate-400">{t("tokenDescription")}</p>
						<p className="mt-3 text-[11px] text-slate-500">
							Firmware {device.firmwareVersion ?? "unknown"} · variant{" "}
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
						{canWrite(current.role) ? (
							<div className="flex flex-wrap gap-2">
								{COMMANDS.map((entry) => (
									<form key={entry.kind} action={commandDeviceAction}>
										<input type="hidden" name="locale" value={locale} />
										<input type="hidden" name="deviceId" value={device.id} />
										<input type="hidden" name="kind" value={entry.kind} />
										<Button type="submit" size="sm" variant="secondary">
											{entry.label}
										</Button>
									</form>
								))}
							</div>
						) : (
							<p className="text-xs text-slate-500">Your role cannot send commands.</p>
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
											<TableCell className="text-xs text-slate-400">
												{command.status.toLowerCase()}
											</TableCell>
											<TableCell className="text-xs text-slate-400">
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
										className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
									>
										<span className="text-slate-500">{key}</span>
										<span className="font-mono text-slate-200">{String(value)}</span>
									</div>
								))}
						</div>
						<p className="mt-3 text-[11px] text-slate-500">
							Config rev {config.rev} · version {config.version}
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
									className="flex items-start gap-3 rounded-lg border border-slate-800/70 bg-slate-950/30 px-3 py-2"
								>
									<Terminal className="mt-0.5 size-3.5 text-slate-500" />
									<div className="min-w-0">
										<p className="text-xs font-medium text-slate-300">
											{event.type.replaceAll("_", " ").toLowerCase()}
										</p>
										<p className="text-[10px] text-slate-500">
											{formatDateTime(event.createdAt, locale)}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</>
	);
}
