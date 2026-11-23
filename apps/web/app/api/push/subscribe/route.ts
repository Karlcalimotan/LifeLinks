import { badRequest, conflict, rateLimited, unauthorized } from "@/lib/api/errors";
import { jsonOk, withApi } from "@/lib/api/instrumentation";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { normalizePushLocale } from "@/lib/push/payload";
import { revokePushSubscription } from "@/lib/push/revoke";
import {
	PUSH_SUBSCRIBE_RATE_LIMIT,
	clampUserAgent,
	pushSubscribeSchema,
	pushUnsubscribeSchema,
} from "@/lib/push/schema";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Store this browser's push subscription for the signed-in user and their
 * organisation. The body cannot choose the owner: `userId` and `orgId` always
 * come from the session, and an endpoint already bound to another account is
 * refused instead of silently reassigned.
 *
 * The endpoint is a capability URL. It is validated as HTTPS, stored, and never
 * echoed to another user or written to a log.
 */
export const POST = withApi(
	async (request) => {
		const current = await getCurrentUser();
		if (!current) throw unauthorized("Sign in to enable browser alerts.");

		const limit = rateLimit(
			`push:${current.user.id}`,
			PUSH_SUBSCRIBE_RATE_LIMIT.limit,
			PUSH_SUBSCRIBE_RATE_LIMIT.windowMs,
		);
		if (!limit.allowed) {
			throw rateLimited(
				`Too many subscription changes. Retry in ${limit.retryAfterSeconds} seconds.`,
			);
		}

		const parsed = pushSubscribeSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) throw badRequest("Invalid push subscription.", parsed.error.flatten());
		const { endpoint, keys } = parsed.data;

		const existing = await prisma.pushSubscription.findUnique({
			where: { endpoint },
			select: { userId: true },
		});
		if (existing && existing.userId !== current.user.id) {
			throw conflict("This browser is subscribed to another account. Sign that account out first.");
		}

		const data = {
			userId: current.user.id,
			orgId: current.org.id,
			endpoint,
			p256dh: keys.p256dh,
			auth: keys.auth,
			userAgent: clampUserAgent(request.headers.get("user-agent")),
			locale: normalizePushLocale(parsed.data.locale),
		};

		const row = await prisma.pushSubscription.upsert({
			where: { endpoint },
			create: data,
			update: data,
			select: { id: true, locale: true },
		});

		return jsonOk({ subscribed: true, id: row.id, locale: row.locale });
	},
	{ route: "POST /api/push/subscribe" },
);

/**
 * Revoke a subscription the caller owns. A missing row is a success: the goal
 * is that this browser no longer receives alerts, not that a row existed.
 */
export const DELETE = withApi(
	async (request) => {
		const current = await getCurrentUser();
		if (!current) throw unauthorized("Sign in to change browser alerts.");

		const limit = rateLimit(
			`push:${current.user.id}`,
			PUSH_SUBSCRIBE_RATE_LIMIT.limit,
			PUSH_SUBSCRIBE_RATE_LIMIT.windowMs,
		);
		if (!limit.allowed) {
			throw rateLimited(
				`Too many subscription changes. Retry in ${limit.retryAfterSeconds} seconds.`,
			);
		}

		const parsed = pushUnsubscribeSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) throw badRequest("Invalid push endpoint.", parsed.error.flatten());

		const revoked = await revokePushSubscription({
			userId: current.user.id,
			orgId: current.org.id,
			endpoint: parsed.data.endpoint,
		});

		return jsonOk({ revoked: revoked > 0 });
	},
	{ route: "DELETE /api/push/subscribe" },
);
