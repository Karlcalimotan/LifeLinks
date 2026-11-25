import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = ["organization", "thresholds", "retention", "members", "audit", "health"];

export default function SettingsLoading() {
	return (
		<div aria-busy="true" aria-live="polite">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>

			<div className="lg:flex lg:items-start lg:gap-6">
				<div className="mb-4 -mx-4 flex gap-1 overflow-x-auto border-b border-ink-700 px-4 sm:mx-0 sm:px-0 lg:mb-0 lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-b-0">
					{TABS.map((tab) => (
						<Skeleton key={tab} className="h-11 w-24 shrink-0 lg:h-9 lg:w-full" />
					))}
				</div>

				<div className="grid min-w-0 flex-1 gap-6 xl:grid-cols-3">
					<Card className="xl:col-span-2">
						<CardHeader>
							<Skeleton className="h-4 w-32" />
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-10 w-full" />
							</div>
							<div className="flex flex-col gap-1.5">
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-24 w-full" />
								<Skeleton className="h-3 w-64 max-w-full" />
							</div>
							<div className="flex flex-col gap-1.5">
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-24 w-full" />
								<Skeleton className="h-3 w-56 max-w-full" />
							</div>
						</CardContent>
					</Card>

					<Card className="flex flex-col">
						<CardContent className="flex flex-1 flex-col gap-3 pt-5">
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-4/5" />
							<Skeleton className="h-3 w-2/3" />
						</CardContent>
						<div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 border-t border-ink-700/70 bg-ink-800 p-4 sm:static sm:p-5">
							<Skeleton className="h-11 w-full sm:h-10 sm:w-36" />
						</div>
					</Card>
				</div>
			</div>
		</div>
	);
}
