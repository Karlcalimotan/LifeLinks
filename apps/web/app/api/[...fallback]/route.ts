import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";

const handler = withApi(
	async () => {
		throw notFound("Unknown API route.");
	},
	{ route: "ANY /api/*" },
);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
