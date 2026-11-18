import { fail } from "@/lib/api/envelope";
import { notFound } from "@/lib/api/errors";

function handler() {
	return fail(notFound("Unknown API route."));
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
