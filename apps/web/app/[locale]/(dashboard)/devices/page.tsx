import { CreateDeviceForm } from "@/components/devices/create-device-form";
import { DevicesToolbar } from "@/components/devices/devices-toolbar";
import { ApprovalBadge, DeviceStatusBadge } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
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
import { canAdminister, requireRole } from "@/lib/auth/session";
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
import { deviceConnectionState } from "@/lib/device/status";
import prisma from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
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

	const [devices, vehicles] = await Promise.all([
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
			<ChevronUp className="size-3" />
		) : (
			<ChevronDown className="size-3" />
		);
	};

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			{deleted === "1" ? (
				<p className="mb-4 rounded border border-clear-500/30 bg-clear-500/10 px-3 py-2 text-xs text-clear-300">
					Tracker deleted.
				</p>
			) : null}
			{error ? (
				<p className="mb-4 rounded border border-alarm-500/30 bg-alarm-500/10 px-3 py-2 text-xs text-alarm-300">
					{error === "forbidden"
						? "Your role cannot change trackers."
						: error === "notfound"
							? "Tracker not found."
							: "Tracker action failed."}
				</p>
			) : null}

			{canAdminister(current.role) ? (
				<Card className="mb-6">
					<CardHeader>
						<CardTitle>Register a tracker</CardTitle>
					</CardHeader>
					<CardContent>
						<CreateDeviceForm
							locale={locale}
							vehicles={vehicles.map((vehicle) => ({
								id: vehicle.id,
								label: `${vehicle.plateNo}: ${vehicle.make} ${vehicle.model}`,
							}))}
						/>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardContent className="pt-5">
					<DevicesToolbar query={effectiveQuery} total={total} />
					{devices.length === 0 ? (
						<div>
							<EmptyState
								title={hasActiveFilters(query) ? "No trackers match these filters." : t("empty")}
							/>
							{hasActiveFilters(query) ? (
								<div className="mt-3 text-center">
									<Link
										href="/devices"
										className="text-xs text-fog-300 underline hover:text-fog-100"
									>
										Clear filters
									</Link>
								</div>
							) : null}
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="sticky left-0 z-10 bg-ink-800">
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
									<TableHead>Status</TableHead>
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
								</TableRow>
							</TableHeader>
							<TableBody>
								{devices.map((device) => {
									const lowBattery = device.batteryV != null && device.batteryV < LOW_BATTERY_V;
									return (
										<TableRow key={device.id} className="group">
											<TableCell className="sticky left-0 z-10 bg-ink-800 group-hover:bg-ink-700/40">
												<Link
													href={`/devices/${device.id}`}
													className="font-medium text-fog-100 hover:text-signal-300 hover:underline"
												>
													{device.label}
												</Link>
											</TableCell>
											<TableCell className="font-mono text-xs text-fog-500">{device.mac}</TableCell>
											<TableCell className="text-fog-300">
												{device.vehicle?.plateNo ?? "Unassigned"}
											</TableCell>
											<TableCell>
												<ApprovalBadge status={device.approvalStatus} />
											</TableCell>
											<TableCell>
												<DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} />
											</TableCell>
											<TableCell className="text-xs text-fog-500">
												{device.firmwareVersion ?? "—"}
											</TableCell>
											<TableCell
												className="text-xs text-fog-500"
												title={formatDateTime(device.lastSeenAt, locale)}
											>
												{formatRelative(device.lastSeenAt)}
											</TableCell>
											<TableCell className="text-xs">
												{device.batteryV != null ? (
													<span className="inline-flex items-center gap-2">
														<span
															className={
																lowBattery ? "font-medium text-caution-300" : "text-fog-500"
															}
														>
															{device.batteryV.toFixed(1)} V
														</span>
														{lowBattery ? <Badge tone="warning">Low</Badge> : null}
													</span>
												) : (
													<span className="text-fog-500">—</span>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
					{pageCount > 1 ? (
						<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
							<span className="text-xs text-fog-500">
								Page {page} of {pageCount} · {total} trackers
							</span>
							<div className="flex gap-2">
								{page > 1 ? (
									<Link
										href={buildDevicesHref(effectiveQuery, { page: page - 1 })}
										className="inline-flex h-8 items-center rounded border border-ink-600 px-3 text-xs text-fog-300 hover:bg-ink-700/60"
									>
										Previous
									</Link>
								) : null}
								{page < pageCount ? (
									<Link
										href={buildDevicesHref(effectiveQuery, { page: page + 1 })}
										className="inline-flex h-8 items-center rounded border border-ink-600 px-3 text-xs text-fog-300 hover:bg-ink-700/60"
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
