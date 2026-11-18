import { currentRequestId } from "./context";
import { ApiError, toApiError } from "./errors";

export interface ApiMeta {
	requestId: string;
	generatedAt: string;
}

export function ok<T>(data: T, init?: ResponseInit & { meta?: Partial<ApiMeta> }): Response {
	const requestId = init?.meta?.requestId ?? currentRequestId();
	const generatedAt = init?.meta?.generatedAt ?? new Date().toISOString();
	const body = {
		data,
		meta: {
			requestId,
			request_id: requestId,
			generatedAt,
		},
	};
	const headers = new Headers(init?.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	headers.set("cache-control", "no-store");
	headers.set("x-request-id", requestId);
	return new Response(JSON.stringify(body), { ...init, headers });
}

export function fail(error: unknown, requestId = currentRequestId()): Response {
	const apiError = toApiError(error);
	const generatedAt = new Date().toISOString();
	const headers = new Headers({
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-request-id": requestId,
	});
	return new Response(
		JSON.stringify({
			error: {
				code: apiError.code,
				message: apiError.message,
				details: apiError.details ?? undefined,
				request_id: requestId,
			},
			meta: { requestId, request_id: requestId, generatedAt },
		}),
		{ status: apiError.status, headers },
	);
}

export { ApiError };
