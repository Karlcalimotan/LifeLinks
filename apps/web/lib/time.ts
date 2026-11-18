/** Asia/Manila day boundary, independent of the server's local timezone. */
export function manilaDayStart(now = new Date()): Date {
	const day = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	return new Date(`${day}T00:00:00+08:00`);
}

export function minutesAgo(minutes: number, now = new Date()): Date {
	return new Date(now.getTime() - minutes * 60_000);
}
