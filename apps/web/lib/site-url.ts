export function resolveSiteUrl(): string {
	const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
	if (configured) return configured.replace(/\/$/, "");

	const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
	if (base) return base.replace(/\/$/, "");

	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return "http://localhost:3000";
}
