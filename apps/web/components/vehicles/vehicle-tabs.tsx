import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { VEHICLE_TABS, type VehicleTab, buildVehicleHref } from "@/lib/vehicles/detail";

export function VehicleTabs({
	vehicleId,
	active,
	labels,
	ariaLabel,
}: {
	vehicleId: string;
	active: VehicleTab;
	labels: Record<VehicleTab, string>;
	ariaLabel: string;
}) {
	return (
		<nav aria-label={ariaLabel} className="mb-5 overflow-x-auto border-b border-ink-700">
			<ul className="flex min-w-max gap-1">
				{VEHICLE_TABS.map((tab) => {
					const isActive = tab === active;
					return (
						<li key={tab}>
							<Link
								href={buildVehicleHref(vehicleId, tab)}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-body transition-colors lg:h-10",
									isActive
										? "border-signal-500 text-fog-50"
										: "border-transparent text-fog-500 hover:text-fog-100",
								)}
							>
								{labels[tab]}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
