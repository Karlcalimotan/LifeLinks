import { RegisterTrackerDrawer } from "@/components/devices/register-tracker-drawer";
import { ApprovalBadge, DeviceStatusBadge } from "@/components/domain/badges";
import { Card, CardContent } from "@/components/ui/card";
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
import { canAdminister, requireRole } from "@/lib/auth/session";
import { batteryBand, deviceConnectionState } from "@/lib/device/status";
import prisma from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function DevicesPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ deleted?: string; error?: string }>;
}) {
	const { locale } = await params;
	const { deleted, error } = await searchParams;
	const current = await requireRole("ADMIN");
	const t = await getTranslations({ locale, namespace: "devices" });

	const [devices, vehicles] = await Promise.all([
		prisma.trackerDevice.findMany({
			where: { orgId: current.org.id },
			orderBy: { createdAt: "desc" },
			include: { vehicle: true },
		}),
		prisma.vehicle.findMany({
			where: { orgId: current.org.id },
			orderBy: { plateNo: "asc" },
			select: { id: true, plateNo: true, make: true, model: true },
		}),
	]);

	const counts = {
		total: devices.length,
		approved: devices.filter((device) => device.approvalStatus === "APPROVED").length,
		pending: devices.filter((device) => device.approvalStatus === "PENDING").length,
		offline: devices.filter((device) => deviceConnectionState(device.lastSeenAt) === "offline")
			.length,
		unknown: devices.filter((device) => deviceConnectionState(device.lastSeenAt) === "unknown")
			.length,
		lowBattery: devices.filter((device) => {
			const band = batteryBand(device.batteryV);
			return band === "low" || band === "critical";
		}).length,
	};
	const firstPending = devices.find((device) => device.approvalStatus === "PENDING");
	const vehicleOptions = vehicles.map((vehicle) => ({
		id: vehicle.id,
		label: `${vehicle.plateNo}: ${vehicle.make} ${vehicle.model}`,
	}));

	return (
		<>
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				actions={
					canAdminister(current.role) ? (
						<RegisterTrackerDrawer
							locale={locale}
							vehicles={vehicleOptions}
							labels={{
								trigger: t("register"),
								title: t("registerTitle"),
								body: t("registerBody"),
								close: t("close"),
							}}
						/>
					) : undefined
				}
			/>

			{deleted === "1" ? (
				<p className="mb-4 rounded-panel border border-clear-400/30 bg-clear-400/10 px-3 py-2 text-meta text-clear-300">
					Tracker deleted.
				</p>
			) : null}
			{error ? (
				<p className="mb-4 rounded-panel border border-alarm-400/30 bg-alarm-400/10 px-3 py-2 text-meta text-alarm-300">
					{error === "forbidden"
						? "Your role cannot change trackers."
						: error === "notfound"
							? "Tracker not found."
							: "Tracker action failed."}
				</p>
			) : null}

			<div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fog-500">
				<span className="font-medium text-fog-100">{t("summary", { count: counts.total })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryApproved", { count: counts.approved })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryPending", { count: counts.pending })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryOffline", { count: counts.offline })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryUnknown", { count: counts.unknown })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryLowBattery", { count: counts.lowBattery })}</span>
			</div>

			{counts.pending > 0 && firstPending ? (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-panel border border-caution-400/30 bg-caution-400/10 px-3 py-2 text-meta text-caution-300">
					<span>{t("pendingCallout", { count: counts.pending })}</span>
					<Link
						href={`/devices/${firstPending.id}`}
						className="font-medium underline-offset-2 hover:underline"
					>
						{t("reviewPending")}
					</Link>
				</div>
			) : null}

			<Card>
				<CardContent className="pt-5">
					{devices.length === 0 ? (
						<EmptyState title={t("empty")} />
					) : (
						<Table className="min-w-[720px]">
							<TableHeader>
								<TableRow>
									<TableHead>{t("label")}</TableHead>
									<TableHead>{t("status")}</TableHead>
									<TableHead>{t("approval")}</TableHead>
									<TableHead>{t("battery")}</TableHead>
									<TableHead>{t("firmware")}</TableHead>
									<TableHead className="text-right">{t("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{devices.map((device) => {
									const state = deviceConnectionState(device.lastSeenAt);
									const band = batteryBand(device.batteryV);
									const percent =
										device.batteryV == null
											? 0
											: Math.min(
													100,
													Math.max(0, ((device.batteryV - 10.5) / (13.2 - 10.5)) * 100),
												);

									return (
										<TableRow key={device.id}>
											<TableCell>
												<Link
													href={`/devices/${device.id}`}
													className="font-medium text-fog-100 hover:text-signal-300 hover:underline"
												>
													{device.label}
												</Link>
												<span className="mt-0.5 block font-mono text-meta text-fog-500">
													{device.mac}
												</span>
												<span className="block text-meta text-fog-500">
													{device.vehicle
														? `${device.vehicle.plateNo} · ${device.vehicle.make} ${device.vehicle.model}`
														: t("unassigned")}
												</span>
											</TableCell>
											<TableCell>
												<DeviceStatusBadge state={state} />
												<span
													className="mt-1 block text-meta text-fog-500"
													title={formatDateTime(device.lastSeenAt, locale)}
												>
													{formatRelative(device.lastSeenAt)}
												</span>
											</TableCell>
											<TableCell>
												<ApprovalBadge status={device.approvalStatus} />
											</TableCell>
											<TableCell>
												{device.batteryV == null ? (
													<span className="text-fog-500">—</span>
												) : (
													<span className="flex items-center gap-2">
														<span
															className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-700"
															aria-hidden="true"
														>
															<span
																className={
																	band === "critical"
																		? "block h-full bg-alarm-500"
																		: band === "low"
																			? "block h-full bg-caution-400"
																			: "block h-full bg-clear-400"
																}
																style={{ width: `${percent}%` }}
															/>
														</span>
														<span className="font-mono text-meta tabular-nums text-fog-300">
															{device.batteryV.toFixed(1)} V
														</span>
													</span>
												)}
											</TableCell>
											<TableCell className="font-mono text-meta text-fog-500">
												{device.firmwareVersion ?? "—"}
											</TableCell>
											<TableCell className="text-right">
												<Link
													href={`/devices/${device.id}`}
													className="inline-flex items-center gap-1 text-meta text-fog-400 hover:text-signal-300"
												>
													{t("open")}
													<ChevronRight className="size-3.5" aria-hidden="true" />
												</Link>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</>
	);
}
