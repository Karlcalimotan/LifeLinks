"use server";

import { canAdminister, requireUser } from "@/lib/auth/session";
import { CONFIG_FIELDS, buildFirmwareConfig } from "@/lib/firmware/config";
import {
	type DeviceConfigFieldErrors,
	type DeviceConfigOverrides,
	OVERRIDE_INPUT_PREFIX,
	configRevFromPayload,
	mergeDeviceConfig,
	overrideRowToValues,
	sameDeviceConfigOverrides,
	validateDeviceConfigOverride,
} from "@/lib/firmware/device-config";
import prisma from "@/lib/prisma";
import { getOrgSettings, settingsToFirmwareValues } from "@/lib/settings/org";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

export interface DeviceConfigState {
	ok: boolean;
	changed?: boolean;
	pushed?: boolean;
	pushState?: "pending" | "confirmed";
	rev?: number;
	error?: "forbidden" | "notfound" | "invalid";
	fieldErrors?: DeviceConfigFieldErrors;
}

const COMMAND_TTL_MS = 10 * 60 * 1000;

function readOverrides(formData: FormData): Record<string, unknown> {
	const input: Record<string, unknown> = {};
	for (const field of CONFIG_FIELDS) {
		if (formData.get(`${OVERRIDE_INPUT_PREFIX}${field.key}`) === "on") {
			input[field.key] = null;
			continue;
		}
		input[field.key] = formData.get(field.key);
	}
	return input;
}

function overrideColumns(values: DeviceConfigOverrides) {
	return {
		impactThresholdG: values.impactThresholdG ?? null,
		tiltThresholdDeg: values.tiltThresholdDeg ?? null,
		confirmWindowMs: values.confirmWindowMs ?? null,
		cancelWindowS: values.cancelWindowS ?? null,
		heartbeatIntervalS: values.heartbeatIntervalS ?? null,
		sosRetryS: values.sosRetryS ?? null,
	};
}

/**
 * Save the per-device overrides and push the merged configuration.
 *
 * The save is audited with the actor and the before/after values. A SET_CONFIG
 * command carries the merged object so the tracker can apply it on its next
 * poll; the dashboard keeps showing "pending device confirmation" until the
 * device echoes the same `configRev`. Saving alone never marks it applied.
 */
export async function updateDeviceConfigAction(
	_previous: DeviceConfigState,
	formData: FormData,
): Promise<DeviceConfigState> {
	const locale = String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
	const current = await requireUser();
	if (!canAdminister(current.role)) return { ok: false, error: "forbidden" };

	const deviceId = String(formData.get("deviceId") ?? "").trim();
	if (!deviceId) return { ok: false, error: "notfound" };

	const device = await prisma.trackerDevice.findFirst({
		where: { id: deviceId, orgId: current.org.id },
		select: { id: true, mac: true, configRev: true },
	});
	if (!device) return { ok: false, error: "notfound" };

	const parsed = validateDeviceConfigOverride(readOverrides(formData));
	if (!parsed.ok) {
		return { ok: false, error: "invalid", fieldErrors: parsed.errors };
	}

	const [settings, existing, lastPush] = await Promise.all([
		getOrgSettings(current.org.id),
		prisma.deviceConfigOverride.findFirst({
			where: { deviceId: device.id, orgId: current.org.id },
		}),
		prisma.deviceCommand.findFirst({
			where: { deviceId: device.id, kind: "SET_CONFIG" },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			select: { id: true, status: true, payload: true },
		}),
	]);

	const orgValues = settingsToFirmwareValues(settings);
	const before = overrideRowToValues(existing);
	const after = parsed.values;
	const beforeMerged = mergeDeviceConfig(orgValues, before);
	const merged = mergeDeviceConfig(orgValues, after);
	const config = buildFirmwareConfig(merged);
	const pushState = device.configRev === config.rev ? "confirmed" : "pending";

	if (sameDeviceConfigOverrides(before, after)) {
		return { ok: true, changed: false, pushed: false, rev: config.rev };
	}

	// The device already reports this revision, or the same revision is still
	// queued/acknowledged. Re-sending a failed or expired push is allowed.
	const lastPushedRev = configRevFromPayload(lastPush?.payload);
	const samePushOutstanding =
		lastPushedRev === config.rev &&
		(lastPush?.status === "PENDING" || lastPush?.status === "ACKED");
	const shouldPush = device.configRev !== config.rev && !samePushOutstanding;

	const now = new Date();
	await prisma.$transaction(async (tx) => {
		if (Object.keys(after).length === 0) {
			await tx.deviceConfigOverride.deleteMany({
				where: { deviceId: device.id, orgId: current.org.id },
			});
		} else {
			const columns = overrideColumns(after);
			await tx.deviceConfigOverride.upsert({
				where: { deviceId: device.id },
				create: { deviceId: device.id, orgId: current.org.id, ...columns },
				update: columns,
			});
		}

		let commandId: string | null = null;
		if (shouldPush) {
			// A newer configuration supersedes anything still waiting to be
			// delivered. The poll also carries the merged config, so an expired
			// command is not a lost update.
			await tx.deviceCommand.updateMany({
				where: { deviceId: device.id, kind: "SET_CONFIG", status: "PENDING" },
				data: { status: "EXPIRED" },
			});
			const command = await tx.deviceCommand.create({
				data: {
					deviceId: device.id,
					kind: "SET_CONFIG",
					payload: config,
					expiresAt: new Date(now.getTime() + COMMAND_TTL_MS),
				},
			});
			commandId = command.id;
		}

		await tx.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "device.config_updated",
				target: device.id,
				metadata: {
					mac: device.mac,
					before,
					after,
					beforeMerged: beforeMerged as unknown as Prisma.InputJsonObject,
					merged: merged as unknown as Prisma.InputJsonObject,
					rev: config.rev,
					pushed: shouldPush,
					commandId,
				},
			},
		});
	});

	revalidatePath(`/${locale}/devices/${device.id}`);
	revalidatePath(`/${locale}/devices`);

	return { ok: true, changed: true, pushed: shouldPush, pushState, rev: config.rev };
}
