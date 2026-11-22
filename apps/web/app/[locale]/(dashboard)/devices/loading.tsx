import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = [
	"select",
	"label",
	"mac",
	"vehicle",
	"approval",
	"connection",
	"signal",
	"battery",
	"firmware",
	"actions",
];
const ROWS = ["row-a", "row-b", "row-c", "row-d", "row-e", "row-f"];

export default function DevicesLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-8 w-40" />
					<Skeleton className="h-4 w-80 max-w-full" />
				</div>
				<Skeleton className="h-8 w-32" />
			</div>

			<Skeleton className="mb-4 h-3 w-96 max-w-full" />

			<Card className="min-w-0">
				<CardContent className="flex flex-col gap-3 pt-5">
					<div className="flex flex-wrap items-end gap-2">
						<Skeleton className="h-10 w-full sm:w-64" />
						<Skeleton className="h-10 w-full sm:w-36" />
						<Skeleton className="h-10 w-full sm:w-36" />
						<Skeleton className="h-10 w-full sm:w-36" />
						<Skeleton className="h-10 w-full sm:w-36" />
						<Skeleton className="h-8 w-16" />
					</div>

					<div className="grid grid-cols-3 gap-3 border-b border-ink-700 pb-3 sm:grid-cols-5 lg:grid-cols-10">
						{COLUMNS.map((column) => (
							<Skeleton key={column} className="h-3 w-14" />
						))}
					</div>

					{ROWS.map((row) => (
						<Skeleton key={row} className="h-10 w-full" />
					))}

					<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
						<Skeleton className="h-3 w-40" />
						<Skeleton className="h-8 w-40" />
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
