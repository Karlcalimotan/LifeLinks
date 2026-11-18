export const dynamic = "force-dynamic";

function environmentStatus() {
	return {
		databaseUrl: Boolean(
			process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL,
		),
		directUrl: Boolean(process.env.DIRECT_URL ?? process.env.POSTGRES_URL_NON_POOLING),
		authSecret: Boolean(process.env.AUTH_SECRET),
		cronSecret: Boolean(process.env.CRON_SECRET),
	};
}

export async function GET() {
	const startedAt = performance.now();
	const env = environmentStatus();

	try {
		// Import inside the handler so a missing database URL is reported by this
		// endpoint instead of failing at module load with a generic render error.
		const { default: prisma } = await import("@/lib/prisma");
		await prisma.$queryRaw`SELECT 1`;
		return Response.json({
			status: "ok",
			database: "reachable",
			env,
			latencyMs: Math.round(performance.now() - startedAt),
			time: new Date().toISOString(),
		});
	} catch {
		return Response.json(
			{
				status: "degraded",
				database: "unreachable",
				env,
				time: new Date().toISOString(),
			},
			{ status: 503 },
		);
	}
}
