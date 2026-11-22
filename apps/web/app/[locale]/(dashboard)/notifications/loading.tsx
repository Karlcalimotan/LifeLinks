import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const LOG_ROWS = ["log-a", "log-b", "log-c", "log-d", "log-e"];
const CONTACT_ROWS = ["contact-a", "contact-b", "contact-c"];

export default function NotificationsLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-52" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-72 max-w-full" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-3 w-56 max-w-full" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</CardContent>
				</Card>
			</div>

			<Card className="mt-6">
				<CardHeader>
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-3 w-64 max-w-full" />
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex flex-wrap gap-3">
						<Skeleton className="h-10 w-44" />
						<Skeleton className="h-10 w-44" />
						<Skeleton className="h-8 w-16" />
					</div>
					{LOG_ROWS.map((row) => (
						<Skeleton key={row} className="h-12 w-full" />
					))}
				</CardContent>
			</Card>

			<Card className="mt-6">
				<CardHeader>
					<Skeleton className="h-4 w-40" />
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					{CONTACT_ROWS.map((row) => (
						<Skeleton key={row} className="h-10 w-full" />
					))}
				</CardContent>
			</Card>
		</div>
	);
}
