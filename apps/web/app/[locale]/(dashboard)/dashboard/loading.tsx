import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const KPIS = ["open", "awaiting", "online", "battery", "alerts", "average"];
const QUEUE_ROWS = ["queue-a", "queue-b", "queue-c"];
const FLEET_ROWS = ["fleet-a", "fleet-b", "fleet-c", "fleet-d"];
const ACTIVITY_ROWS = ["activity-a", "activity-b", "activity-c", "activity-d"];

export default function DashboardLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-8 w-56" />
					<Skeleton className="h-4 w-80 max-w-full" />
				</div>
				<Skeleton className="h-9 w-40" />
			</div>

			<Card className="overflow-hidden">
				<div className="grid grid-cols-2 gap-px bg-ink-700 sm:grid-cols-3 xl:grid-cols-6">
					{KPIS.map((key) => (
						<div key={key} className="bg-ink-800 p-4">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="mt-2 h-7 w-16" />
							<Skeleton className="mt-2 h-3 w-28" />
						</div>
					))}
				</div>
			</Card>

			<div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
				<Card className="flex flex-col">
					<CardHeader>
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-64 max-w-full" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-56 w-full" />
						<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
							{["incident", "online", "weak", "offline", "stale"].map((key) => (
								<Skeleton key={key} className="h-3 w-20" />
							))}
						</div>
					</CardContent>
				</Card>

				<Card className="flex flex-col">
					<CardHeader>
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-3 w-56 max-w-full" />
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{QUEUE_ROWS.map((key) => (
							<div key={key} className="flex flex-col gap-2">
								<Skeleton className="h-4 w-40" />
								<Skeleton className="h-3 w-56 max-w-full" />
								<Skeleton className="h-8 w-full" />
							</div>
						))}
					</CardContent>
				</Card>
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-3">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-3 w-40" />
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{FLEET_ROWS.map((key) => (
							<Skeleton key={key} className="h-16 w-full" />
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-48" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{ACTIVITY_ROWS.map((key) => (
							<div key={key} className="flex gap-2.5">
								<Skeleton className="size-4 shrink-0" />
								<div className="flex flex-1 flex-col gap-1.5">
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-3 w-16" />
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3 w-44" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-7 w-16" />
						<Skeleton className="mt-4 h-28 w-full" />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
