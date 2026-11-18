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

export default async function DevicesPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
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
								label: `${vehicle.plateNo} · ${vehicle.make} ${vehicle.model}`,
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
												className="font-medium text-brand-400 hover:text-brand-300"
											>
												{device.label}
											</Link>
											<span className="block">
												<DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} />
											</span>
										</TableCell>
										<TableCell className="font-mono text-xs text-slate-400">{device.mac}</TableCell>
										<TableCell className="text-slate-300">
											{device.vehicle?.plateNo ?? "Unassigned"}
										</TableCell>
										<TableCell>
											<ApprovalBadge status={device.approvalStatus} />
										</TableCell>
										<TableCell className="text-xs text-slate-400">
											{device.firmwareVersion ?? "—"}
										</TableCell>
										<TableCell className="text-xs text-slate-400">
											{formatRelative(device.lastSeenAt)}
										</TableCell>
										<TableCell className="text-xs text-slate-400">
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
