import { DeviceStatusBadge, VehicleStatusBadge } from "@/components/domain/badges";
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
import { requireUser } from "@/lib/auth/session";
import { deviceConnectionState } from "@/lib/device/status";
import prisma from "@/lib/prisma";
import { formatRelative } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function VehiclesPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const current = await requireUser();
	const t = await getTranslations({ locale, namespace: "vehicles" });

	const vehicles = await prisma.vehicle.findMany({
		where: { orgId: current.org.id },
		orderBy: { plateNo: "asc" },
		include: {
			devices: true,
			_count: { select: { impacts: true, trips: true } },
		},
	});

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />
			<Card>
				<CardContent className="pt-5">
					{vehicles.length === 0 ? (
						<EmptyState title={t("empty")} />
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("plate")}</TableHead>
									<TableHead>{t("makeModel")}</TableHead>
									<TableHead>{t("driver")}</TableHead>
									<TableHead>{t("tracker")}</TableHead>
									<TableHead>{t("lastSeen")}</TableHead>
									<TableHead>{t("status")}</TableHead>
									<TableHead>Incidents</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{vehicles.map((vehicle) => {
									const device = vehicle.devices[0];
									return (
										<TableRow key={vehicle.id}>
											<TableCell>
												<Link
													href={`/vehicles/${vehicle.id}`}
													className="font-medium text-brand-400 hover:text-brand-300"
												>
													{vehicle.plateNo}
												</Link>
											</TableCell>
											<TableCell className="text-slate-200">
												{vehicle.make} {vehicle.model}
												{vehicle.year ? ` · ${vehicle.year}` : ""}
											</TableCell>
											<TableCell>
												{vehicle.driverName ?? "—"}
												{vehicle.driverPhone ? (
													<span className="block text-[11px] text-slate-500">
														{vehicle.driverPhone}
													</span>
												) : null}
											</TableCell>
											<TableCell>
												{device ? (
													<span className="flex flex-col gap-1">
														<span className="text-xs text-slate-300">{device.label}</span>
														<DeviceStatusBadge state={deviceConnectionState(device.lastSeenAt)} />
													</span>
												) : (
													<span className="text-xs text-slate-500">No tracker</span>
												)}
											</TableCell>
											<TableCell className="text-xs text-slate-400">
												{formatRelative(device?.lastSeenAt)}
											</TableCell>
											<TableCell>
												<VehicleStatusBadge status={vehicle.status} />
											</TableCell>
											<TableCell className="text-slate-300">{vehicle._count.impacts}</TableCell>
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
