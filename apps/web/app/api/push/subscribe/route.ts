import {
	badRequest,
	conflict,
	rateLimited,
	serviceUnavailable,
	unauthorized,
} from "@/lib/api/errors";
import { jsonOk, withApi } from "@/lib/api/instrumentation";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { readVapidConfig } from "@/lib/push/config";
import { normalizePushLocale } from "@/lib/push/payload";
import { revokePushSubscription } from "@/lib/push/revoke";
import {
	PUSH_SUBSCRIBE_RATE_LIMIT,
	PUSH_SUBSCRIPTION_CONFLICT,
	clampUserAgent,
	pushSubscribeSchema,
	pushUnsubscribeSchema,
} from "@/lib/push/schema";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ROW_SELECT = { id: true, locale: true } as const;

function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
	);
}

/**
 * Store this browser's push subscription for the signed-in user and their
 * organisation.
 *
 * The write is atomic. An `updateMany` scoped to the session owner either
 * updates the caller's row or matches nothing; only then does a `create` run.
 * The update never carries `userId` or `orgId`, so a racing request cannot
 * reassign another account's endpoint. A unique-conflict on create is resolved
 * by re-reading the endpoint and refusing (generic 409) unless it belongs to
 * the caller.
 *
 * The endpoint itself is a capability URL and an outbound request target: the
 * schema allows only known push services, and the sender revalidates.
 */
export const POST = withApi(
	async (request) => {
		const current = await getCurrentUser();
		if (!current) throw unauthorized("Sign in to enable browser alerts.");

		if (!readVapidConfig()) {
			throw serviceUnavailable("Browser alerts are not configured on this server.");
		}

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

		const data = {
			p256dh: keys.p256dh,
			auth: keys.auth,
			userAgent: clampUserAgent(request.headers.get("user-agent")),
			locale: normalizePushLocale(parsed.data.locale),
		};
		const owner = { userId: current.user.id, orgId: current.org.id };

		const updated = await prisma.pushSubscription.updateMany({
			where: { endpoint, ...owner },
			data,
		});
		if (updated.count > 0) {
			const row = await prisma.pushSubscription.findUnique({
				where: { endpoint },
				select: ROW_SELECT,
			});
			return jsonOk({ subscribed: true, id: row?.id ?? null, locale: row?.locale ?? data.locale });
		}

		try {
			const row = await prisma.pushSubscription.create({
				data: { ...data, endpoint, ...owner },
				select: ROW_SELECT,
			});
			return jsonOk({ subscribed: true, id: row.id, locale: row.locale });
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
		}

		// Someone created this endpoint between our update and create. It may be
		// this account retrying, or another account's row; never take it over.
		const existing = await prisma.pushSubscription.findUnique({
			where: { endpoint },
			select: { userId: true },
		});
		if (!existing || existing.userId !== current.user.id) {
			throw conflict(PUSH_SUBSCRIPTION_CONFLICT);
		}

		const retried = await prisma.pushSubscription.updateMany({
			where: { endpoint, ...owner },
			data,
		});
		if (retried.count === 0) throw conflict(PUSH_SUBSCRIPTION_CONFLICT);

		const row = await prisma.pushSubscription.findUnique({
			where: { endpoint },
			select: ROW_SELECT,
		});
		return jsonOk({ subscribed: true, id: row?.id ?? null, locale: row?.locale ?? data.locale });
	},
	{ route: "POST /api/push/subscribe" },
);

/**
 * Revoke a subscription the caller owns. A missing row is a success: the goal
 * is that this browser no longer receives alerts, not that a row existed.
 * Revocation keeps working when push is unconfigured, so a stale row can always
 * be removed.
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
