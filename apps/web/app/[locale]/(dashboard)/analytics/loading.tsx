import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATS = ["incidents", "crashes", "false-alarms", "acknowledge", "resolve"];
const TABLE_ROWS = ["row-a", "row-b", "row-c", "row-d"];
const BARS = [
	"bar-01",
	"bar-02",
	"bar-03",
	"bar-04",
	"bar-05",
	"bar-06",
	"bar-07",
	"bar-08",
	"bar-09",
	"bar-10",
	"bar-11",
	"bar-12",
	"bar-13",
	"bar-14",
];

export default function AnalyticsLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-56" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
				{STATS.map((key) => (
					<Skeleton key={key} className="h-24 w-full" />
				))}
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3 w-64" />
					</CardHeader>
					<CardContent className="flex items-end gap-1">
						{BARS.map((key) => (
							<Skeleton key={key} className="h-32 flex-1" />
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-24" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{["severity-a", "severity-b", "severity-c", "severity-d"].map((key) => (
							<Skeleton key={key} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
			</div>

			<Card className="mt-6">
				<CardHeader>
					<Skeleton className="h-4 w-48" />
				</CardHeader>
				<CardContent className="flex items-end gap-1">
					{BARS.map((key) => (
						<Skeleton key={`hour-${key}`} className="h-24 flex-1" />
					))}
				</CardContent>
			</Card>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.55fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-44" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{["vehicle-a", "vehicle-b", "vehicle-c"].map((key) => (
							<Skeleton key={key} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-40" />
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{TABLE_ROWS.map((key) => (
							<Skeleton key={key} className="h-10 w-full" />
						))}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
