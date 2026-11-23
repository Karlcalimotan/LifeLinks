import "server-only";

import prisma from "@/lib/prisma";

/**
 * Subscription revocation. Logout removes this browser's row; the owner can
 * remove it from the console; the sender removes it when the push service says
 * the endpoint is gone.
 *
 * Logout must never fail because revocation failed: the operator asked to sign
 * out, and a stale row is better than a session that will not close.
 */

export async function revokePushSubscription({
	userId,
	orgId,
	endpoint,
}: {
	userId: string;
	orgId: string;
	endpoint: string;
}): Promise<number> {
	const result = await prisma.pushSubscription.deleteMany({
		where: { endpoint, userId, orgId },
	});
	return result.count;
}

export interface LogoutRevokeInput {
	userId: string;
	orgId: string;
	/** Sent by the browser when it could read its own subscription. */
	endpoint: string | null;
	/** Fallback when the browser did not send an endpoint. */
	userAgent: string | null;
}

export async function revokePushOnLogout(input: LogoutRevokeInput): Promise<number> {
	try {
		if (input.endpoint) {
			return await revokePushSubscription({
				userId: input.userId,
				orgId: input.orgId,
				endpoint: input.endpoint,
			});
		}
		if (input.userAgent) {
			const result = await prisma.pushSubscription.deleteMany({
				where: { userId: input.userId, orgId: input.orgId, userAgent: input.userAgent },
			});
			return result.count;
		}
		return 0;
	} catch (error) {
		console.warn(
			`[push] could not revoke a subscription on logout (${error instanceof Error ? error.name : "unknown"})`,
		);
		return 0;
	}
}
