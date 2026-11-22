import { BatteryLevel } from "@/components/devices/battery-level";
import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { CopyMac } from "@/components/devices/copy-mac";
import { type SignalLabels, SignalStrength } from "@/components/devices/signal-strength";
import { ApprovalBadge, DeviceStatusBadge } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/routing";
import { approveDeviceAction } from "@/lib/actions/devices";
import { firmwareUpdateAvailable } from "@/lib/device/firmware";
import { deviceConnectionState } from "@/lib/device/status";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export interface DeviceCardItem {
	id: string;
	label: string;
	mac: string;
	approvalStatus: string;
	lastSeenAt: Date | null;
	rssiDbm: number | null;
	batteryV: number | null;
	firmwareVersion: string | null;
	vehicle: { plateNo: string } | null;
}

export async function DeviceCardList({
	locale,
	devices,
	signalLabels,
	latestFirmware,
	canApprove,
}: {
	locale: string;
	devices: readonly DeviceCardItem[];
	signalLabels: SignalLabels;
	latestFirmware: string | null;
	canApprove: boolean;
}) {
	const t = await getTranslations({ locale, namespace: "devices" });

	return (
		<ul className="flex flex-col divide-y divide-ink-700/70">
			{devices.map((device) => {
				const connectionState = deviceConnectionState(device.lastSeenAt);
				const installedFirmware = device.firmwareVersion?.trim() || null;
				const pending = device.approvalStatus === "PENDING";

				return (
					<li key={device.id} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div className="min-w-0">
								<Link
									href={`/devices/${device.id}`}
									className="break-words font-medium text-emphasis text-fog-100 hover:text-signal-300 hover:underline"
								>
									{device.label}
								</Link>
								<div className="mt-0.5">
									<CopyMac value={device.mac} />
								</div>
							</div>
							<ApprovalBadge status={device.approvalStatus} />
						</div>

						<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-meta">
							<div className="min-w-0">
								<dt className="text-fog-500">{t("vehicle")}</dt>
								<dd className="mt-0.5 text-fog-300">
									{device.vehicle?.plateNo ?? t("unassigned")}
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("connection")}</dt>
								<dd className="mt-0.5 flex flex-col items-start gap-1">
									<DeviceStatusBadge state={connectionState} />
									<span
										className="text-fog-500"
										title={
											device.lastSeenAt ? formatDateTime(device.lastSeenAt, locale) : undefined
										}
									>
										{device.lastSeenAt ? formatRelative(device.lastSeenAt) : t("noHeartbeat")}
									</span>
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("signal")}</dt>
								<dd className="mt-0.5">
									<SignalStrength
										rssiDbm={device.rssiDbm}
										state={connectionState}
										labels={signalLabels}
									/>
								</dd>
							</div>
							<div className="min-w-0">
								<dt className="text-fog-500">{t("battery")}</dt>
								<dd className="mt-0.5">
									<BatteryLevel voltage={device.batteryV} />
								</dd>
							</div>
							<div className="col-span-2 min-w-0">
								<dt className="text-fog-500">{t("firmware")}</dt>
								<dd className="mt-0.5 flex flex-wrap items-center gap-2">
									<span
										className="min-w-0 truncate font-mono text-fog-500"
										title={installedFirmware ?? undefined}
									>
										{installedFirmware ?? "—"}
									</span>
									{firmwareUpdateAvailable(installedFirmware, latestFirmware) ? (
										<Badge tone="info">{t("updateAvailable")}</Badge>
									) : null}
								</dd>
							</div>
						</dl>

						<div className="flex flex-wrap items-center gap-2">
							{pending && canApprove ? (
								<form action={approveDeviceAction}>
									<input type="hidden" name="locale" value={locale} />
									<input type="hidden" name="deviceId" value={device.id} />
									<ConfirmSubmit
										message={t("approveConfirm", { label: device.label })}
										confirmLabel={t("approve")}
										variant="secondary"
										size="lg"
									>
										{t("approve")}
									</ConfirmSubmit>
								</form>
							) : null}
							<Link
								href={`/devices/${device.id}`}
								aria-label={t("openTracker", { label: device.label })}
								className="inline-flex h-11 items-center gap-1 rounded-panel border border-ink-600 px-4 text-body text-fog-300 hover:bg-ink-700/60 hover:text-fog-100"
							>
								{t("open")}
								<ChevronRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
