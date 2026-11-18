import { ApiError, toApiError } from "./errors";

export interface ApiMeta {
	requestId: string;
	generatedAt: string;
}

export function ok<T>(data: T, init?: ResponseInit & { meta?: Partial<ApiMeta> }): Response {
	const requestId = init?.meta?.requestId ?? crypto.randomUUID();
	const body = {
		data,
		meta: {
			requestId,
			generatedAt: init?.meta?.generatedAt ?? new Date().toISOString(),
		},
	};
	const headers = new Headers(init?.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	headers.set("x-request-id", requestId);
	return new Response(JSON.stringify(body), { ...init, headers });
}

export function fail(error: unknown, requestId = crypto.randomUUID()): Response {
	const apiError = toApiError(error);
	const headers = new Headers({
		"content-type": "application/json; charset=utf-8",
		"x-request-id": requestId,
	});
	return new Response(
		JSON.stringify({
			error: {
				code: apiError.code,
				message: apiError.message,
				details: apiError.details ?? undefined,
			},
			meta: { requestId, generatedAt: new Date().toISOString() },
		}),
		{ status: apiError.status, headers },
	);
}

export { ApiError };
