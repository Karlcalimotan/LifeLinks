import { BatteryLevel } from "@/components/devices/battery-level";
import {
	BulkApproveProvider,
	BulkRowCheckbox,
	BulkSelectAll,
} from "@/components/devices/bulk-approve";
import { CopyMac } from "@/components/devices/copy-mac";
import { DeviceCardList } from "@/components/devices/device-card-list";
import {
	DevicesFilterProvider,
	DevicesFilterResults,
	DevicesToolbar,
} from "@/components/devices/devices-toolbar";
import { RegisterTrackerDrawer } from "@/components/devices/register-tracker-drawer";
import { SignalStrength } from "@/components/devices/signal-strength";
import { ApprovalBadge, DeviceStatusBadge } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
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
import { DEVICE_OFFLINE_AFTER_MIN } from "@/lib/constants";
import { firmwareUpdateAvailable, latestKnownFirmware } from "@/lib/device/firmware";
import {
	DEVICE_PAGE_SIZE,
	LOW_BATTERY_V,
	type SortField,
	buildDevicesHref,
	deviceOrderBy,
	deviceWhere,
	hasActiveFilters,
	parseDevicesQuery,
} from "@/lib/device/query";
import { batteryBand, deviceConnectionState } from "@/lib/device/status";
import { metadataForPage } from "@/lib/page-metadata";
import prisma from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return metadataForPage(locale, "devices");
}

const SORT_FIELDS: readonly SortField[] = ["label", "mac", "approval", "lastSeen", "battery"];

const SORT_LABELS: Record<SortField, string> = {
	label: "label",
	mac: "mac",
	approval: "approval",
	lastSeen: "connection",
	battery: "battery",
};

export default async function DevicesPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{
		deleted?: string;
		error?: string;
		[key: string]: string | string[] | undefined;
	}>;
}) {
	const { locale } = await params;
	const rawSearch = await searchParams;
	const deleted = typeof rawSearch.deleted === "string" ? rawSearch.deleted : "";
	const error = typeof rawSearch.error === "string" ? rawSearch.error : "";
	const query = parseDevicesQuery(rawSearch);
	const current = await requireRole("ADMIN");
	const t = await getTranslations({ locale, namespace: "devices" });

	const where = deviceWhere(current.org.id, query);
	const total = await prisma.trackerDevice.count({ where });
	const pageCount = Math.max(1, Math.ceil(total / DEVICE_PAGE_SIZE));
	const page = Math.min(query.page, pageCount);
	const effectiveQuery = { ...query, page };
	const orgWhere = { orgId: current.org.id };
	const offlineBefore = new Date(Date.now() - DEVICE_OFFLINE_AFTER_MIN * 60_000);

	const [
		devices,
		vehicles,
		orgTotal,
		approvedCount,
		pendingCount,
		neverSeenCount,
		offlineCount,
		lowBatteryCount,
		firstPending,
	] = await Promise.all([
		prisma.trackerDevice.findMany({
			where,
			orderBy: deviceOrderBy(effectiveQuery),
			skip: (page - 1) * DEVICE_PAGE_SIZE,
			take: DEVICE_PAGE_SIZE,
			include: { vehicle: true },
		}),
		prisma.vehicle.findMany({
			where: { orgId: current.org.id },
			orderBy: { plateNo: "asc" },
			select: { id: true, plateNo: true, make: true, model: true },
		}),
		prisma.trackerDevice.count({ where: orgWhere }),
		prisma.trackerDevice.count({ where: { ...orgWhere, approvalStatus: "APPROVED" } }),
		prisma.trackerDevice.count({ where: { ...orgWhere, approvalStatus: "PENDING" } }),
		prisma.trackerDevice.count({ where: { ...orgWhere, lastSeenAt: null } }),
		prisma.trackerDevice.count({
			where: { ...orgWhere, lastSeenAt: { lt: offlineBefore } },
		}),
		prisma.trackerDevice.count({
			where: { ...orgWhere, batteryV: { lt: LOW_BATTERY_V } },
		}),
		prisma.trackerDevice.findFirst({
			where: { ...orgWhere, approvalStatus: "PENDING" },
			orderBy: { createdAt: "asc" },
			select: { id: true },
		}),
	]);

	const sortHref = (field: SortField) =>
		buildDevicesHref(effectiveQuery, {
			sort: field,
			dir: effectiveQuery.sort === field && effectiveQuery.dir === "asc" ? "desc" : "asc",
			page: 1,
		});
	const sortIcon = (field: SortField) => {
		if (effectiveQuery.sort !== field) return null;
		return effectiveQuery.dir === "asc" ? (
			<ChevronUp className="size-4" aria-hidden="true" />
		) : (
			<ChevronDown className="size-4" aria-hidden="true" />
		);
	};
	const latestFirmware = latestKnownFirmware(process.env.LIFELINK_FIRMWARE_VERSION);
	const pendingIds = devices
		.filter((device) => device.approvalStatus === "PENDING")
		.map((device) => device.id);
	const signalLabels = {
		strong: t("signalStrong"),
		good: t("signalGood"),
		fair: t("signalFair"),
		poor: t("signalPoor"),
		noSignal: t("noSignal"),
		noReading: t("noReading"),
	};
	const emptyState = (
		<div>
			<EmptyState
				title={hasActiveFilters(query) ? t("emptyFiltered") : t("empty")}
				body={hasActiveFilters(query) ? t("emptyFilteredBody") : undefined}
			/>
			{hasActiveFilters(query) ? (
				<div className="mt-3 text-center">
					<Link href="/devices" className="text-meta text-fog-300 hover:text-signal-300">
						{t("clearFilters")}
					</Link>
				</div>
			) : null}
		</div>
	);

	return (
		<>
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				actions={
					canAdminister(current.role) ? (
						<RegisterTrackerDrawer
							locale={locale}
							vehicles={vehicles.map((vehicle) => ({
								id: vehicle.id,
								label: `${vehicle.plateNo}: ${vehicle.make} ${vehicle.model}`,
							}))}
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
				<span className="font-medium text-fog-100">{t("summary", { count: orgTotal })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryApproved", { count: approvedCount })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryPending", { count: pendingCount })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryOffline", { count: offlineCount })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryUnknown", { count: neverSeenCount })}</span>
				<span aria-hidden="true">·</span>
				<span>{t("summaryLowBattery", { count: lowBatteryCount })}</span>
			</div>

			{pendingCount > 0 && firstPending ? (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-panel border border-caution-400/30 bg-caution-400/10 px-3 py-2 text-meta text-caution-300">
					<span>{t("pendingCallout", { count: pendingCount })}</span>
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
					<DevicesFilterProvider>
						<DevicesToolbar query={effectiveQuery} total={total} />
						<DevicesFilterResults>
							<div className="hidden lg:block">
								<BulkApproveProvider locale={locale} pendingIds={pendingIds}>
									{devices.length === 0 ? (
										emptyState
									) : (
										<Table className="min-w-[1040px]">
											<TableHeader>
												<TableRow>
													<TableHead className="w-10">
														<BulkSelectAll />
													</TableHead>
													<TableHead>
														<Link
															href={sortHref("label")}
															className="inline-flex items-center gap-1 hover:text-fog-100"
														>
															{t("label")}
															{sortIcon("label")}
														</Link>
													</TableHead>
													<TableHead>
														<Link
															href={sortHref("mac")}
															className="inline-flex items-center gap-1 hover:text-fog-100"
														>
															{t("mac")}
															{sortIcon("mac")}
														</Link>
													</TableHead>
													<TableHead>{t("vehicle")}</TableHead>
													<TableHead>
														<Link
															href={sortHref("approval")}
															className="inline-flex items-center gap-1 hover:text-fog-100"
														>
															{t("approval")}
															{sortIcon("approval")}
														</Link>
													</TableHead>
													<TableHead>
														<Link
															href={sortHref("lastSeen")}
															className="inline-flex items-center gap-1 hover:text-fog-100"
														>
															{t("connection")}
															{sortIcon("lastSeen")}
														</Link>
													</TableHead>
													<TableHead>{t("signal")}</TableHead>
													<TableHead>
														<Link
															href={sortHref("battery")}
															className="inline-flex items-center gap-1 hover:text-fog-100"
														>
															{t("battery")}
															{sortIcon("battery")}
														</Link>
													</TableHead>
													<TableHead>{t("firmware")}</TableHead>
													<TableHead className="text-right">{t("actions")}</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{devices.map((device) => {
													const connectionState = deviceConnectionState(device.lastSeenAt);
													const installedFirmware = device.firmwareVersion?.trim() || null;

													return (
														<TableRow key={device.id}>
															<TableCell className="w-10">
																{device.approvalStatus === "PENDING" ? (
																	<BulkRowCheckbox deviceId={device.id} label={device.label} />
																) : null}
															</TableCell>
															<TableCell>
																<Link
																	href={`/devices/${device.id}`}
																	className="font-medium text-fog-100 hover:text-signal-300 hover:underline"
																>
																	{device.label}
																</Link>
															</TableCell>
															<TableCell>
																<CopyMac value={device.mac} />
															</TableCell>
															<TableCell className="text-fog-300">
																{device.vehicle?.plateNo ?? t("unassigned")}
															</TableCell>
															<TableCell>
																<ApprovalBadge status={device.approvalStatus} />
															</TableCell>
															<TableCell>
																<div className="flex flex-col gap-1">
																	<DeviceStatusBadge state={connectionState} />
																	<span
																		className="text-meta text-fog-500"
																		title={
																			device.lastSeenAt
																				? formatDateTime(device.lastSeenAt, locale)
																				: undefined
																		}
																	>
																		{device.lastSeenAt
																			? formatRelative(device.lastSeenAt)
																			: t("noHeartbeat")}
																	</span>
																</div>
															</TableCell>
															<TableCell>
																<SignalStrength
																	rssiDbm={device.rssiDbm}
																	state={connectionState}
																	labels={signalLabels}
																/>
															</TableCell>
															<TableCell>
																<BatteryLevel voltage={device.batteryV} />
															</TableCell>
															<TableCell>
																<span className="flex flex-col items-start gap-1">
																	<span className="font-mono text-meta text-fog-500">
																		{installedFirmware ?? "—"}
																	</span>
																	{firmwareUpdateAvailable(installedFirmware, latestFirmware) ? (
																		<Badge tone="info">{t("updateAvailable")}</Badge>
																	) : null}
																</span>
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
								</BulkApproveProvider>
							</div>
							<div className="lg:hidden">
								{devices.length === 0 ? (
									emptyState
								) : (
									<>
										<div className="mb-3 flex flex-wrap gap-2">
											{SORT_FIELDS.map((field) => {
												const active = effectiveQuery.sort === field;
												return (
													<Link
														key={field}
														href={sortHref(field)}
														className={`inline-flex h-10 items-center gap-1 rounded-control border px-2 text-meta sm:h-8 ${
															active
																? "border-signal-500/40 bg-signal-500/10 text-signal-300"
																: "border-ink-700 text-fog-400 hover:border-ink-600 hover:text-fog-100"
														}`}
													>
														{t(SORT_LABELS[field])}
														{sortIcon(field)}
													</Link>
												);
											})}
										</div>
										<DeviceCardList
											locale={locale}
											devices={devices}
											signalLabels={signalLabels}
											latestFirmware={latestFirmware}
											canApprove={canAdminister(current.role)}
										/>
									</>
								)}
							</div>
							{pageCount > 1 ? (
								<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
									<span className="text-meta text-fog-500">
										{t("pageSummary", { page, pages: pageCount, total })}
									</span>
									<div className="flex gap-2">
										{page > 1 ? (
											<Link
												href={buildDevicesHref(effectiveQuery, { page: page - 1 })}
												className="inline-flex h-10 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60 sm:h-8"
											>
												{t("previous")}
											</Link>
										) : null}
										{page < pageCount ? (
											<Link
												href={buildDevicesHref(effectiveQuery, { page: page + 1 })}
												className="inline-flex h-10 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60 sm:h-8"
											>
												{t("next")}
											</Link>
										) : null}
									</div>
								</div>
							) : null}
						</DevicesFilterResults>
					</DevicesFilterProvider>
				</CardContent>
			</Card>
		</>
	);
}
