export type ApiErrorCode =
	| "BAD_REQUEST"
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "CONFLICT"
	| "RATE_LIMITED"
	| "INTERNAL";

export class ApiError extends Error {
	readonly status: number;
	readonly code: ApiErrorCode;
	readonly details?: unknown;

	constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

export function badRequest(message: string, details?: unknown) {
	return new ApiError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Unauthorized") {
	return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden") {
	return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Not found") {
	return new ApiError(404, "NOT_FOUND", message);
}

export function conflict(message: string, details?: unknown) {
	return new ApiError(409, "CONFLICT", message, details);
}

export function rateLimited(message = "Too many requests") {
	return new ApiError(429, "RATE_LIMITED", message);
}

export function internal(message = "Something went wrong") {
	return new ApiError(500, "INTERNAL", message);
}

export function toApiError(error: unknown): ApiError {
	if (error instanceof ApiError) return error;
	if (error instanceof Error) return internal(error.message);
	return internal();
}
