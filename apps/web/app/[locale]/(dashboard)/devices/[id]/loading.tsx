import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const CONNECTIVITY = ["last-seen", "battery", "signal", "satellites", "gps-age", "config"];
const CONFIG_ROWS = ["config-a", "config-b", "config-c", "config-d", "config-e", "config-f"];
const EVENTS = ["event-a", "event-b", "event-c", "event-d"];

export default function DeviceDetailLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-80 max-w-full" />
				<Skeleton className="h-4 w-56" />
			</div>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<Skeleton className="h-6 w-24" />
				<Skeleton className="h-6 w-20" />
			</div>

			<Card className="mb-6">
				<CardHeader>
					<Skeleton className="h-4 w-32" />
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-10 w-full" />
					</div>
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-10 w-full" />
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-28" />
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-3">
						{CONNECTIVITY.map((stat) => (
							<Skeleton key={stat} className="h-16 w-full" />
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex-row items-center justify-between">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-8 w-24" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-4/5" />
						<Skeleton className="h-3 w-56 max-w-full" />
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-28" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="flex flex-wrap gap-2">
							<Skeleton className="h-8 w-24" />
							<Skeleton className="h-8 w-24" />
							<Skeleton className="h-8 w-20" />
							<Skeleton className="h-8 w-20" />
						</div>
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-36" />
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-2">
						{CONFIG_ROWS.map((row) => (
							<Skeleton key={row} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
			</div>

			<Card className="mt-6">
				<CardHeader>
					<Skeleton className="h-4 w-24" />
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					{EVENTS.map((event) => (
						<Skeleton key={event} className="h-12 w-full" />
					))}
				</CardContent>
			</Card>

			<Card className="mt-6">
				<CardHeader>
					<Skeleton className="h-4 w-28" />
				</CardHeader>
				<CardContent className="flex flex-wrap items-center justify-between gap-3">
					<Skeleton className="h-3 w-80 max-w-full" />
					<Skeleton className="h-8 w-32" />
				</CardContent>
			</Card>
		</div>
	);
}
