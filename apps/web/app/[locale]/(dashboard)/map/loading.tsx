import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const LIST_ROWS = ["map-row-a", "map-row-b", "map-row-c", "map-row-d", "map-row-e", "map-row-f"];

export default function MapLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-44" />
				<Skeleton className="h-4 w-96 max-w-full" />
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
				<Card className="flex flex-col overflow-hidden">
					<div className="flex flex-col gap-3 border-b border-ink-700 p-4">
						<div className="flex items-center justify-between gap-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-3 w-10" />
						</div>
						<Skeleton className="h-10 w-full" />
						<div className="flex flex-wrap gap-1.5">
							<Skeleton className="h-8 w-12" />
							<Skeleton className="h-8 w-16" />
							<Skeleton className="h-8 w-16" />
							<Skeleton className="h-8 w-24" />
						</div>
					</div>
					<div className="flex flex-col gap-3 p-4">
						{LIST_ROWS.map((key) => (
							<div key={key} className="flex items-start gap-3">
								<Skeleton className="mt-1 size-3.5 rounded-full" />
								<div className="flex flex-1 flex-col gap-1.5">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-3 w-32" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
						))}
					</div>
				</Card>

				<Card className="flex flex-col overflow-hidden">
					<div className="flex items-start justify-between gap-2 border-b border-ink-700 p-4">
						<div className="flex flex-col gap-1.5">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
						<Skeleton className="h-8 w-20" />
					</div>
					<Skeleton className="aspect-[4/3] w-full rounded-none" />
					<div className="flex flex-wrap gap-3 border-t border-ink-700 px-4 py-3">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-3 w-24" />
					</div>
				</Card>
			</div>
		</div>
	);
}
