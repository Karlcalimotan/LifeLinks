import { type RequestContext, runWithRequestContext } from "./context";
import { fail, ok } from "./envelope";
import { ApiError, toApiError } from "./errors";

type Handler = (request: Request) => Promise<Response> | Response;

export interface ApiConfig {
	route?: string;
	timeoutMs?: number;
	/** Device payloads already have their own envelope; skip the wrapper. */
	passthrough?: boolean;
}

/** API regulation absolute ceiling: 2 s. Cron/background routes may override. */
const DEFAULT_TIMEOUT_MS = 2_000;
const SLOW_MS = 300;
const VIOLATION_MS = 400;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

function requestIdFrom(request: Request): string {
	const incoming = request.headers.get("x-request-id") ?? "";
	return SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}

function setTimingHeaders(
	headers: Headers,
	requestId: string,
	elapsedMs: number,
	context: RequestContext,
): void {
	const timing = [`total;dur=${elapsedMs.toFixed(1)}`];
	if (context.dbMs > 0) timing.push(`db;dur=${context.dbMs.toFixed(1)}`);
	headers.set("x-request-id", requestId);
	headers.set("x-response-time", `${elapsedMs.toFixed(1)}ms`);
	headers.set("server-timing", timing.join(", "));
	headers.set("cache-control", "no-store");
}

function logLatency(route: string, status: number, elapsedMs: number, context: RequestContext) {
	if (process.env.NODE_ENV === "test") return;
	const line = `${route} status=${status} total=${elapsedMs.toFixed(1)}ms db=${context.dbMs.toFixed(1)}ms queries=${context.queries} request_id=${context.requestId}`;
	if (elapsedMs > VIOLATION_MS) console.error(`[api] VIOLATION (>${VIOLATION_MS}ms) ${line}`);
	else if (elapsedMs > SLOW_MS) console.warn(`[api] SLOW (>${SLOW_MS}ms) ${line}`);
}

/**
 * One request pipeline for every JSON route (API regulation §8–§9):
 * - a sanitized request id on every response, matching `meta.request_id`
 * - a 2 s hard timeout so a stuck query cannot hang a device
 * - `Server-Timing`, `X-Response-Time` and `X-Request-Id`
 * - error normalization into the shared `{ error }` envelope
 * - SLOW (>300 ms) and VIOLATION (>400 ms) logs
 */
export function withApi(handler: Handler, config: ApiConfig = {}) {
	const route = config.route ?? "unknown";

	return async (request: Request): Promise<Response> => {
		const requestId = requestIdFrom(request);
		const startedAt = performance.now();
		const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const context: RequestContext = { requestId, startedAt, dbMs: 0, queries: 0 };

		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new ApiError(504, "TIMEOUT", "Gateway timeout")), timeoutMs);
		});

		try {
			const response = await runWithRequestContext(context, () =>
				Promise.race([handler(request), timeout]),
			);
			const elapsed = performance.now() - startedAt;
			const headers = new Headers(response.headers);
			setTimingHeaders(headers, requestId, elapsed, context);
			logLatency(route, response.status, elapsed, context);
			return new Response(response.body, { status: response.status, headers });
		} catch (error) {
			const elapsed = performance.now() - startedAt;
			const apiError = toApiError(error);
			const response = fail(apiError, requestId);
			setTimingHeaders(response.headers, requestId, elapsed, context);
			logLatency(route, apiError.status, elapsed, context);
			if (process.env.NODE_ENV !== "test") {
				const detail = error instanceof Error ? error.message : "unknown error";
				console.error(`[api] ${route} ${apiError.status} request_id=${requestId}: ${detail}`);
			}
			return response;
		} finally {
			if (timer) clearTimeout(timer);
		}
	};
}

export function jsonOk<T>(data: T): Response {
	return ok(data);
}

export { fail };
