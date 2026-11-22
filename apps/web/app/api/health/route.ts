import { fail } from "@/lib/api/envelope";
import { rateLimited } from "@/lib/api/errors";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const CACHE_MS = 5_000;
const RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

interface DatabaseCheck {
	status: number;
	database: "reachable" | "unreachable";
	checkedAt: number;
}

let cachedCheck: DatabaseCheck | null = null;

function clientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

async function checkDatabase(): Promise<{ status: number; database: "reachable" | "unreachable" }> {
	try {
		// Import inside the handler so a missing database URL is reported by this
		// endpoint instead of failing at module load with a generic render error.
		const { default: prisma } = await import("@/lib/prisma");
		await prisma.$queryRaw`SELECT 1`;
		return { status: 200, database: "reachable" };
	} catch {
		return { status: 503, database: "unreachable" };
	}
}

export async function GET(request: Request) {
	const limit = rateLimit(`health:${clientIp(request)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
	if (!limit.allowed) {
		return fail(
			rateLimited(`Too many health checks. Retry in ${limit.retryAfterSeconds} seconds.`),
		);
	}

	const startedAt = performance.now();
	const incoming = request.headers.get("x-request-id") ?? "";
	const requestId = SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();

	const now = Date.now();
	let check = cachedCheck;
	if (!check || now - check.checkedAt >= CACHE_MS) {
		const checked = await checkDatabase();
		check = { ...checked, checkedAt: now };
		cachedCheck = check;
	}

	const elapsed = performance.now() - startedAt;
	const body = {
		status: check.status === 200 ? "ok" : "degraded",
		database: check.database,
		latencyMs: Math.round(elapsed),
		request_id: requestId,
		time: new Date().toISOString(),
	};
	return new Response(JSON.stringify(body), {
		status: check.status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			"x-request-id": requestId,
			"x-response-time": `${elapsed.toFixed(1)}ms`,
			"server-timing": `total;dur=${elapsed.toFixed(1)}`,
		},
	});
}
