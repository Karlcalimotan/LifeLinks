import { fail, ok } from "./envelope";
import { ApiError, toApiError } from "./errors";

type Handler = (request: Request) => Promise<Response> | Response;

export interface ApiConfig {
	route?: string;
	timeoutMs?: number;
	/** Device payloads already have their own envelope; skip the wrapper. */
	passthrough?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * One request pipeline for every JSON route:
 * - a request id on every response, including failures
 * - a hard timeout so a stuck query cannot hang a device
 * - error normalization into the shared `{ error }` envelope
 * - `Server-Timing` for the browser and logs
 *
 * Device routes use `passthrough` only when the firmware expects a flat body;
 * LifeLink keeps every route on the envelope so the contract stays uniform.
 */
export function withApi(handler: Handler, config: ApiConfig = {}) {
	const route = config.route ?? "unknown";

	return async (request: Request): Promise<Response> => {
		const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
		const startedAt = performance.now();
		const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const timeout = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new ApiError(504, "INTERNAL", "Gateway timeout")), timeoutMs);
		});

		try {
			const response = await Promise.race([handler(request), timeout]);
			const elapsed = performance.now() - startedAt;
			const headers = new Headers(response.headers);
			headers.set("x-request-id", requestId);
			headers.set("server-timing", `total;dur=${elapsed.toFixed(1)}`);
			return new Response(response.body, { status: response.status, headers });
		} catch (error) {
			const apiError = toApiError(error);
			if (process.env.NODE_ENV !== "test") {
				console.error(`[api] ${route} ${apiError.status} ${apiError.message}`);
			}
			return fail(apiError, requestId);
		}
	};
}

export function jsonOk<T>(data: T): Response {
	return ok(data);
}

export { fail };
