import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
	requestId: string;
	startedAt: number;
	/** Reserved for Prisma timing once query instrumentation is added. */
	dbMs: number;
	queries: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
	return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
	return storage.getStore();
}

export function currentRequestId(fallback?: string): string {
	return storage.getStore()?.requestId ?? fallback ?? crypto.randomUUID();
}
