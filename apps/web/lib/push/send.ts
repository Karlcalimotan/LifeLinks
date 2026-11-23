import "server-only";

import prisma from "@/lib/prisma";
import { sendNotification } from "web-push";
import { type VapidConfig, readVapidConfig } from "./config";
import { buildIncidentPushPayload } from "./payload";
import { isAllowedPushEndpoint } from "./schema";

/**
 * Web Push sender for new incidents.
 *
 * The device incident route schedules this after its transaction has committed,
 * and only for a confirmed incident. Nothing here may reject: a push failure is
 * a delivery problem, never an incident problem. Delivery is bounded (a small
 * number of subscriptions, one parallel batch, a short socket timeout).
 *
 * Recipients respect the console's ownership rules: incident managers
 * (ADMIN/RESPONDER) and the vehicle owner. The owner keeps a reserved slot so a
 * busy organisation cannot push them out of the capped fan-out.
 *
 * A stored endpoint is revalidated before every send, so a row created before
 * the allowlist existed cannot be used to reach an arbitrary host.
 *
 * Logs never contain an endpoint, a p256dh/auth key, a token or a payload.
 */

/** Hard cap on recipients per incident. More than a handful is a bug. */
export const PUSH_FANOUT_LIMIT = 20;

/** Socket timeout per delivery; the whole batch runs in parallel. */
export const PUSH_SEND_TIMEOUT_MS = 1_500;

/** A crash notification is only useful while the event is current. */
export const PUSH_TTL_SECONDS = 600;

export const EXPIRED_PUSH_STATUS_CODES = [404, 410] as const;

export interface PushSendSummary {
	configured: boolean;
	targeted: number;
	sent: number;
	removed: number;
	failed: number;
}

export interface IncidentPushInput {
	orgId: string;
	incidentId: string;
	vehicleId: string;
}

interface SubscriptionRow {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	locale: string;
}

const EMPTY_SUMMARY = { targeted: 0, sent: 0, removed: 0, failed: 0 } as const;

function readStatusCode(error: unknown): number | null {
	if (typeof error !== "object" || error === null) return null;
	const statusCode = (error as { statusCode?: unknown }).statusCode;
	return typeof statusCode === "number" ? statusCode : null;
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : "unknown";
}

function isExpired(statusCode: number | null): boolean {
	return (
		statusCode !== null && (EXPIRED_PUSH_STATUS_CODES as readonly number[]).includes(statusCode)
	);
}

async function removeExpired(ids: string[]): Promise<number> {
	if (ids.length === 0) return 0;
	try {
		const result = await prisma.pushSubscription.deleteMany({ where: { id: { in: ids } } });
		return result.count;
	} catch (error) {
		console.warn(`[push] could not remove expired subscriptions (${errorName(error)})`);
		return 0;
	}
}

async function recipientSubscriptions(
	orgId: string,
	ownerId: string | null,
): Promise<SubscriptionRow[]> {
	// Reserve the owner's slot first. The cap is for resource safety, not a
	// reason to drop the person whose vehicle is in the incident.
	const ownerSubscriptions = ownerId
		? await prisma.pushSubscription.findMany({
				where: { orgId, userId: ownerId },
				select: { id: true, endpoint: true, p256dh: true, auth: true, locale: true },
				orderBy: { createdAt: "desc" },
				take: 1,
			})
		: [];

	const remaining = PUSH_FANOUT_LIMIT - ownerSubscriptions.length;
	if (remaining <= 0) return ownerSubscriptions;

	const members = await prisma.membership.findMany({
		where: {
			orgId,
			role: { in: ["ADMIN" as const, "RESPONDER" as const] },
			...(ownerId ? { userId: { not: ownerId } } : {}),
		},
		select: { userId: true },
		take: remaining,
	});
	if (members.length === 0) return ownerSubscriptions;

	const operatorSubscriptions = await prisma.pushSubscription.findMany({
		where: { orgId, userId: { in: members.map((member) => member.userId) } },
		select: { id: true, endpoint: true, p256dh: true, auth: true, locale: true },
		orderBy: { createdAt: "desc" },
		take: remaining,
	});

	return [...ownerSubscriptions, ...operatorSubscriptions];
}

async function deliver(
	subscriptions: SubscriptionRow[],
	input: IncidentPushInput,
	plateNo: string,
	config: VapidConfig,
): Promise<{ sent: number; failed: number; expired: string[] }> {
	const results = await Promise.allSettled(
		subscriptions.map(async (subscription) => {
			if (!isAllowedPushEndpoint(subscription.endpoint)) {
				return { id: subscription.id, outcome: "blocked" as const };
			}
			const payload = buildIncidentPushPayload({
				incidentId: input.incidentId,
				plate: plateNo,
				locale: subscription.locale,
			});
			await sendNotification(
				{
					endpoint: subscription.endpoint,
					keys: { p256dh: subscription.p256dh, auth: subscription.auth },
				},
				JSON.stringify(payload),
				{
					TTL: PUSH_TTL_SECONDS,
					urgency: "high",
					timeout: PUSH_SEND_TIMEOUT_MS,
					vapidDetails: {
						subject: config.subject,
						publicKey: config.publicKey,
						privateKey: config.privateKey,
					},
				},
			);
			return { id: subscription.id, outcome: "sent" as const };
		}),
	);

	let sent = 0;
	let failed = 0;
	const expired: string[] = [];
	results.forEach((result, index) => {
		if (result.status === "fulfilled") {
			if (result.value.outcome === "sent") {
				sent += 1;
			} else {
				failed += 1;
				console.warn("[push] delivery blocked: endpoint host is not allowed.");
			}
			return;
		}
		const subscription = subscriptions[index];
		if (!subscription) return;
		const statusCode = readStatusCode(result.reason);
		if (isExpired(statusCode)) {
			expired.push(subscription.id);
			return;
		}
		failed += 1;
		console.warn(`[push] delivery failed status=${statusCode ?? "unknown"}`);
	});

	return { sent, failed, expired };
}

/**
 * Notify the operators who are allowed to see this incident. The device route
 * schedules it with `after()`, so the response is already on its way; the
 * function still resolves instead of rejecting when nothing is configured, the
 * vehicle is gone, or every delivery fails.
 */
export async function notifyIncidentPush(input: IncidentPushInput): Promise<PushSendSummary> {
	try {
		const config = readVapidConfig();
		if (!config) {
			console.info("[push] VAPID keys are not configured; incident push skipped.");
			return { configured: false, ...EMPTY_SUMMARY };
		}

		const vehicle = await prisma.vehicle.findFirst({
			where: { id: input.vehicleId, orgId: input.orgId },
			select: { plateNo: true, ownerId: true },
		});
		if (!vehicle) return { configured: true, ...EMPTY_SUMMARY };

		const subscriptions = await recipientSubscriptions(input.orgId, vehicle.ownerId);
		if (subscriptions.length === 0) return { configured: true, ...EMPTY_SUMMARY };

		const { sent, failed, expired } = await deliver(subscriptions, input, vehicle.plateNo, config);
		const removed = await removeExpired(expired);

		if (removed > 0) {
			console.info(`[push] removed ${removed} expired subscription(s).`);
		}

		return { configured: true, targeted: subscriptions.length, sent, failed, removed };
	} catch (error) {
		// The incident is already committed. This line must never include an
		// endpoint, a key or a response body from the push service.
		console.error(`[push] incident notification failed (${errorName(error)})`);
		return { configured: true, ...EMPTY_SUMMARY };
	}
}
