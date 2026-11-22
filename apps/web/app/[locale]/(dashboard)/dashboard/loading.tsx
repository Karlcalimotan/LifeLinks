import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATS = ["stat-a", "stat-b", "stat-c"];
const INCIDENT_ROWS = ["incident-a", "incident-b", "incident-c", "incident-d", "incident-e"];
const FLEET_ROWS = ["fleet-a", "fleet-b", "fleet-c", "fleet-d"];

export default function DashboardLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-56" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>

			<div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
				<Card className="min-h-72">
					<CardContent className="flex flex-col gap-4 p-6">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-10 w-24" />
						<Skeleton className="h-4 w-full max-w-md" />
						<Skeleton className="h-9 w-36" />
						<div className="mt-auto grid grid-cols-2 gap-4 border-t border-ink-700 pt-4">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					</CardContent>
				</Card>
				<div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
					{STATS.map((key) => (
						<Skeleton key={key} className="h-24 w-full" />
					))}
				</div>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-40" />
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{INCIDENT_ROWS.map((key) => (
							<Skeleton key={key} className="h-10 w-full" />
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-32" />
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{FLEET_ROWS.map((key) => (
							<Skeleton key={key} className="h-16 w-full" />
						))}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
