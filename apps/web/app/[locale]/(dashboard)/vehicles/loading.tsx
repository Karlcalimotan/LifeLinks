import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = ["plate", "vehicle", "driver", "tracker", "last-seen", "status", "incidents"];
const ROWS = ["row-a", "row-b", "row-c", "row-d", "row-e", "row-f"];

export default function VehiclesLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>

			<Card className="min-w-0">
				<CardContent className="flex flex-col gap-3 pt-5">
					<div className="grid grid-cols-3 gap-3 border-b border-ink-700 pb-3 sm:grid-cols-7">
						{COLUMNS.map((column) => (
							<Skeleton key={column} className="h-3 w-16" />
						))}
					</div>
					{ROWS.map((row) => (
						<Skeleton key={row} className="h-10 w-full" />
					))}
				</CardContent>
			</Card>
		</div>
	);
}
