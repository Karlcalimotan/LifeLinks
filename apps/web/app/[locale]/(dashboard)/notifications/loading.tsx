import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const LOG_ROWS = ["log-a", "log-b", "log-c", "log-d", "log-e"];
const LOG_CARDS = ["log-card-a", "log-card-b", "log-card-c", "log-card-d", "log-card-e"];
const CONTACT_ROWS = ["contact-a", "contact-b", "contact-c"];
const CONTACT_CARDS = ["contact-card-a", "contact-card-b", "contact-card-c"];

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
					<div className="hidden flex-col gap-3 lg:flex">
						{LOG_ROWS.map((row) => (
							<Skeleton key={row} className="h-12 w-full" />
						))}
					</div>
					<ul className="flex flex-col divide-y divide-ink-700/70 lg:hidden">
						{LOG_CARDS.map((row) => (
							<li key={row} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="flex min-w-0 flex-col gap-2">
										<Skeleton className="h-3 w-10" />
										<Skeleton className="h-5 w-36 max-w-full" />
									</div>
									<Skeleton className="h-5 w-16" />
								</div>
								<div className="grid grid-cols-2 gap-x-4 gap-y-3">
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-3 w-14" />
										<Skeleton className="h-4 w-20 max-w-full" />
									</div>
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-3 w-12" />
										<Skeleton className="h-4 w-16" />
									</div>
									<div className="col-span-2 flex flex-col gap-1.5">
										<Skeleton className="h-3 w-12" />
										<Skeleton className="h-4 w-full" />
									</div>
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-3 w-14" />
										<Skeleton className="h-4 w-8" />
									</div>
								</div>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<Card className="mt-6">
				<CardHeader>
					<Skeleton className="h-4 w-40" />
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<div className="hidden flex-col gap-2 lg:flex">
						{CONTACT_ROWS.map((row) => (
							<Skeleton key={row} className="h-10 w-full" />
						))}
					</div>
					<ul className="flex flex-col divide-y divide-ink-700/70 lg:hidden">
						{CONTACT_CARDS.map((row) => (
							<li key={row} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
								<div className="flex flex-wrap items-start justify-between gap-2">
									<Skeleton className="h-5 w-32 max-w-full" />
									<Skeleton className="h-5 w-16" />
								</div>
								<div className="flex flex-col gap-1.5">
									<Skeleton className="h-3 w-12" />
									<Skeleton className="h-4 w-28 max-w-full" />
								</div>
								<div className="flex flex-col gap-1.5">
									<Skeleton className="h-3 w-10" />
									<Skeleton className="h-4 w-48 max-w-full" />
								</div>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
		</div>
	);
}
