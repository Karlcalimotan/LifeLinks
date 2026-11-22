"use client";

import { formatDuration } from "@/lib/analytics/aggregate";
import { useEffect, useState } from "react";

/**
 * Ticks once a second after mount. The server renders `initialMs`, which is
 * also the first client render, so the markup matches and the timer never
 * depends on a refresh. `title` carries the absolute timestamp.
 */
export function ElapsedTime({
	since,
	initialMs,
	title,
	className,
}: {
	since: string;
	initialMs: number;
	title?: string;
	className?: string;
}) {
	const sinceMs = Date.parse(since);
	const [now, setNow] = useState<number | null>(null);

	useEffect(() => {
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const elapsed = now == null || Number.isNaN(sinceMs) ? initialMs : Math.max(0, now - sinceMs);

	return (
		<time dateTime={since} title={title} className={className}>
			{formatDuration(elapsed)}
		</time>
	);
}
