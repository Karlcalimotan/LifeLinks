import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATS = ["peak", "tilt", "vibration", "speed"];
const TIMELINE = ["detected", "cancel-window", "acknowledged", "resolved"];
const ALERT_ROWS = ["alert-a", "alert-b", "alert-c"];

export default function IncidentDetailLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-8 w-64 max-w-full" />
					<Skeleton className="h-4 w-48" />
				</div>
				<Skeleton className="h-8 w-28" />
			</div>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<Skeleton className="h-6 w-24" />
				<Skeleton className="h-6 w-20" />
				<Skeleton className="h-6 w-28" />
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-28" />
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<Skeleton className="h-56 w-full" />
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							{STATS.map((stat) => (
								<Skeleton key={stat} className="h-16 w-full" />
							))}
						</div>
						<Skeleton className="h-3 w-72 max-w-full" />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-24" />
					</CardHeader>
					<CardContent className="flex flex-col gap-4 border-l border-ink-700 pl-4">
						{TIMELINE.map((step) => (
							<div key={step} className="flex flex-col gap-2">
								<Skeleton className="h-3 w-40" />
								<Skeleton className="h-3 w-28" />
							</div>
						))}
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-32" />
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{ALERT_ROWS.map((row) => (
							<Skeleton key={row} className="h-10 w-full" />
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-20" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<Skeleton className="h-8 w-32" />
						<Skeleton className="h-9 w-full max-w-xs" />
						<Skeleton className="h-3 w-48" />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
