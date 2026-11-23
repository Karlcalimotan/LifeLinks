import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = ["overview", "trips", "incidents", "settings"];

export default function VehicleDetailLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-64 max-w-full" />
				<Skeleton className="h-4 w-48" />
			</div>

			<div className="mb-4 flex flex-wrap gap-2">
				<Skeleton className="h-6 w-20" />
				<Skeleton className="h-6 w-28" />
			</div>

			<div className="mb-5 flex gap-2 overflow-hidden border-b border-ink-700 pb-2">
				{TABS.map((tab) => (
					<Skeleton key={tab} className="h-8 w-24 shrink-0" />
				))}
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-32" />
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-20 w-full" />
					</CardContent>
				</Card>
				<div className="flex flex-col gap-6">
					<Card>
						<CardHeader>
							<Skeleton className="h-4 w-24" />
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-3/4" />
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<Skeleton className="h-4 w-20" />
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-2/3" />
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
