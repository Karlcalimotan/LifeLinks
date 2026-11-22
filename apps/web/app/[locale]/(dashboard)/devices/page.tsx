import { DevicesToolbar } from "@/components/devices/devices-toolbar";
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
import { DEVICE_OFFLINE_AFTER_MIN } from "@/lib/constants";
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
import prisma from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

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
			<ChevronUp className="size-3" aria-hidden="true" />
		) : (
			<ChevronDown className="size-3" aria-hidden="true" />
		);
	};

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
					<DevicesToolbar query={effectiveQuery} total={total} />
					{devices.length === 0 ? (
						<div>
							<EmptyState
								title={hasActiveFilters(query) ? "No trackers match these filters" : t("empty")}
								body={
									hasActiveFilters(query) ? "Clear the filters to see every tracker." : undefined
								}
							/>
							{hasActiveFilters(query) ? (
								<div className="mt-3 text-center">
									<Link href="/devices" className="text-meta text-fog-300 hover:text-signal-300">
										Clear filters
									</Link>
								</div>
							) : null}
						</div>
					) : (
						<Table className="min-w-[860px]">
							<TableHeader>
								<TableRow>
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
									<TableHead>{t("status")}</TableHead>
									<TableHead>{t("firmware")}</TableHead>
									<TableHead>
										<Link
											href={sortHref("lastSeen")}
											className="inline-flex items-center gap-1 hover:text-fog-100"
										>
											{t("lastSeen")}
											{sortIcon("lastSeen")}
										</Link>
									</TableHead>
									<TableHead>
										<Link
											href={sortHref("battery")}
											className="inline-flex items-center gap-1 hover:text-fog-100"
										>
											{t("battery")}
											{sortIcon("battery")}
										</Link>
									</TableHead>
									<TableHead className="text-right">{t("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{devices.map((device) => {
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
											</TableCell>
											<TableCell className="font-mono text-meta text-fog-500">
												{device.mac}
											</TableCell>
											<TableCell className="text-fog-300">
												{device.vehicle?.plateNo ?? t("unassigned")}
											</TableCell>
											<TableCell>
												<ApprovalBadge status={device.approvalStatus} />
											</TableCell>
											<TableCell>
												<DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} />
											</TableCell>
											<TableCell className="font-mono text-meta text-fog-500">
												{device.firmwareVersion ?? "—"}
											</TableCell>
											<TableCell
												className="text-meta text-fog-500"
												title={formatDateTime(device.lastSeenAt, locale)}
											>
												{formatRelative(device.lastSeenAt)}
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
					{pageCount > 1 ? (
						<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
							<span className="text-meta text-fog-500">
								Page {page} of {pageCount} · {total} trackers
							</span>
							<div className="flex gap-2">
								{page > 1 ? (
									<Link
										href={buildDevicesHref(effectiveQuery, { page: page - 1 })}
										className="inline-flex h-8 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60"
									>
										Previous
									</Link>
								) : null}
								{page < pageCount ? (
									<Link
										href={buildDevicesHref(effectiveQuery, { page: page + 1 })}
										className="inline-flex h-8 items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-300 hover:bg-ink-700/60"
									>
										Next
									</Link>
								) : null}
							</div>
						</div>
					) : null}
				</CardContent>
			</Card>
		</>
	);
}
