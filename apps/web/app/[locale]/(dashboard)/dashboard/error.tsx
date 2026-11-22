"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/routing";

export default function DashboardError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<Card className="mx-auto mt-10 max-w-xl">
			<CardContent className="flex flex-col gap-4 p-6">
				<h1 className="font-display text-section font-semibold text-fog-50">
					The dashboard could not load.
				</h1>
				<p className="text-body text-fog-500">
					The tracker and incident data did not arrive. Try again, and if it keeps failing, check
					the health endpoint.
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<Button type="button" size="sm" onClick={reset}>
						Try again
					</Button>
					<Link href="/" className="text-meta text-fog-300 underline hover:text-fog-100">
						Back to the dashboard
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
