import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = ["plate", "vehicle", "driver", "tracker", "last-seen", "status", "incidents"];
const ROWS = ["row-a", "row-b", "row-c", "row-d", "row-e", "row-f"];
const CARD_ROWS = ["card-a", "card-b", "card-c", "card-d", "card-e", "card-f"];

export default function VehiclesLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>

			<Card className="min-w-0">
				<CardContent className="pt-5">
					<div className="hidden flex-col gap-3 lg:flex">
						<div className="grid grid-cols-7 gap-3 border-b border-ink-700 pb-3">
							{COLUMNS.map((column) => (
								<Skeleton key={column} className="h-3 w-16" />
							))}
						</div>
						{ROWS.map((row) => (
							<Skeleton key={row} className="h-10 w-full" />
						))}
					</div>

					<ul className="flex flex-col divide-y divide-ink-700/70 lg:hidden">
						{CARD_ROWS.map((row) => (
							<li key={row} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="flex min-w-0 flex-col gap-2">
										<Skeleton className="h-5 w-28" />
										<Skeleton className="h-3 w-40 max-w-full" />
									</div>
									<Skeleton className="h-5 w-16" />
								</div>
								<div className="grid grid-cols-2 gap-x-4 gap-y-3">
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-3 w-12" />
										<Skeleton className="h-4 w-24 max-w-full" />
									</div>
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-3 w-14" />
										<Skeleton className="h-4 w-24 max-w-full" />
									</div>
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-3 w-16" />
										<Skeleton className="h-4 w-14" />
									</div>
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-3 w-16" />
										<Skeleton className="h-4 w-10" />
									</div>
								</div>
								<Skeleton className="h-11 w-24" />
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
		</div>
	);
}
