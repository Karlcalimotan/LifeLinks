import { CreateDeviceForm } from "@/components/devices/create-device-form";
import { ApprovalBadge, DeviceStatusBadge } from "@/components/domain/badges";
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
import { deviceConnectionState } from "@/lib/device/status";
import prisma from "@/lib/prisma";
import { formatRelative } from "@/lib/utils";
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
					{devices.length === 0 ? (
						<EmptyState title={t("empty")} />
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("label")}</TableHead>
									<TableHead>{t("mac")}</TableHead>
									<TableHead>{t("vehicle")}</TableHead>
									<TableHead>{t("approval")}</TableHead>
									<TableHead>{t("firmware")}</TableHead>
									<TableHead>{t("lastSeen")}</TableHead>
									<TableHead>{t("battery")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{devices.map((device) => (
									<TableRow key={device.id}>
										<TableCell>
											<Link
												href={`/devices/${device.id}`}
												className="font-medium text-signal-400 hover:text-signal-300"
											>
												{device.label}
											</Link>
											<span className="block">
												<DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} />
											</span>
										</TableCell>
										<TableCell className="font-mono text-xs text-fog-500">{device.mac}</TableCell>
										<TableCell className="text-fog-300">
											{device.vehicle?.plateNo ?? "Unassigned"}
										</TableCell>
										<TableCell>
											<ApprovalBadge status={device.approvalStatus} />
										</TableCell>
										<TableCell className="text-xs text-fog-500">
											{device.firmwareVersion ?? "—"}
										</TableCell>
										<TableCell className="text-xs text-fog-500">
											{formatRelative(device.lastSeenAt)}
										</TableCell>
										<TableCell className="text-xs text-fog-500">
											{device.batteryV != null ? `${device.batteryV.toFixed(1)} V` : "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</>
	);
}
