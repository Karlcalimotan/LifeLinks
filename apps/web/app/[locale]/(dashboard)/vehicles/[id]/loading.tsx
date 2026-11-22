import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATS = ["speed", "battery", "satellites", "ignition"];
const TRIP_ROWS = ["trip-a", "trip-b", "trip-c", "trip-d", "trip-e"];

export default function VehicleDetailLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-8 w-72 max-w-full" />
					<Skeleton className="h-4 w-56" />
				</div>
				<Skeleton className="h-8 w-28" />
			</div>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<Skeleton className="h-6 w-24" />
				<Skeleton className="h-6 w-28" />
			</div>

			<div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-32" />
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex items-center gap-3">
							<Skeleton className="size-9 shrink-0" />
							<div className="flex flex-col gap-2">
								<Skeleton className="h-4 w-48" />
								<Skeleton className="h-3 w-40" />
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							{STATS.map((stat) => (
								<Skeleton key={stat} className="h-16 w-full" />
							))}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-28" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3 w-56 max-w-full" />
						<Skeleton className="h-3 w-64 max-w-full" />
						<Skeleton className="h-3 w-48" />
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-2">
				{["trips", "incidents"].map((card) => (
					<Card key={card}>
						<CardHeader>
							<Skeleton className="h-4 w-36" />
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							{TRIP_ROWS.map((row) => (
								<Skeleton key={`${card}-${row}`} className="h-10 w-full" />
							))}
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
