import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const CHIPS = [
	"all",
	"suspected",
	"confirmed",
	"acknowledged",
	"resolved",
	"cancelled",
	"false-alarm",
];
const ROWS = ["row-a", "row-b", "row-c", "row-d", "row-e", "row-f"];

export default function IncidentsLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-72 max-w-full" />
			</div>

			<Card className="min-w-0">
				<CardContent className="flex flex-col gap-4 pt-5">
					<div className="flex flex-wrap items-end gap-3">
						<div className="flex w-full flex-col gap-1.5 sm:w-72">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-10 w-full" />
						</div>
						<div className="flex w-full flex-col gap-1.5 sm:w-40">
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-10 w-full" />
						</div>
						<div className="flex w-full flex-col gap-1.5 sm:w-40">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-10 w-full" />
						</div>
						<Skeleton className="h-8 w-16" />
					</div>

					<div className="flex flex-wrap gap-2">
						{CHIPS.map((chip) => (
							<Skeleton key={chip} className="h-9 w-24" />
						))}
					</div>

					<div className="flex flex-col gap-2">
						{ROWS.map((row) => (
							<Skeleton key={row} className="h-12 w-full" />
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
