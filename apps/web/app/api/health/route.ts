export const dynamic = "force-dynamic";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

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

export async function GET(request: Request) {
	const startedAt = performance.now();
	const incoming = request.headers.get("x-request-id") ?? "";
	const requestId = SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
	const env = environmentStatus();

	let status = 200;
	let database = "reachable";
	try {
		// Import inside the handler so a missing database URL is reported by this
		// endpoint instead of failing at module load with a generic render error.
		const { default: prisma } = await import("@/lib/prisma");
		await prisma.$queryRaw`SELECT 1`;
	} catch {
		status = 503;
		database = "unreachable";
	}

	const elapsed = performance.now() - startedAt;
	const body = {
		status: status === 200 ? "ok" : "degraded",
		database,
		env,
		latencyMs: Math.round(elapsed),
		request_id: requestId,
		time: new Date().toISOString(),
	};
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			"x-request-id": requestId,
			"x-response-time": `${elapsed.toFixed(1)}ms`,
			"server-timing": `total;dur=${elapsed.toFixed(1)}`,
		},
	});
}
