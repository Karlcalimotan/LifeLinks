"use server";

import { canAdminister, requireUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { maintenanceTarget } from "@/lib/vehicles/detail";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const maintenanceSchema = z.object({
	vehicleId: z.string().min(1),
	action: z.enum(["enable", "disable"]),
});

function localeFrom(formData: FormData): string {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

/**
 * Move a vehicle between ACTIVE and MAINTENANCE. The status is a fleet marker:
 * no incident or alert path reads it, and this action does not touch them.
 */
export async function setMaintenanceModeAction(formData: FormData) {
	const locale = localeFrom(formData);
	const vehicleId = String(formData.get("vehicleId") ?? "");

	const current = await requireUser();
	if (!canAdminister(current.role)) {
		redirect(`/${locale}/vehicles/${vehicleId}?tab=settings&error=forbidden`);
	}

	const parsed = maintenanceSchema.safeParse({
		vehicleId,
		action: formData.get("action"),
	});
	if (!parsed.success) {
		redirect(`/${locale}/vehicles/${vehicleId}?tab=settings&error=invalid`);
	}

	const vehicle = await prisma.vehicle.findFirst({
		where: { id: parsed.data.vehicleId, orgId: current.org.id },
		select: { id: true, plateNo: true, status: true },
	});
	if (!vehicle) redirect(`/${locale}/vehicles?error=notfound`);

	const nextStatus = maintenanceTarget(vehicle.status, parsed.data.action);
	if (!nextStatus) {
		redirect(`/${locale}/vehicles/${vehicle.id}?tab=settings&error=status`);
	}

	await prisma.$transaction([
		prisma.vehicle.update({
			where: { id: vehicle.id },
			data: { status: nextStatus },
		}),
		prisma.auditLog.create({
			data: {
				orgId: current.org.id,
				actorId: current.user.id,
				action: "vehicle.maintenance",
				target: vehicle.id,
				metadata: { plateNo: vehicle.plateNo, from: vehicle.status, to: nextStatus },
			},
		}),
	]);

	revalidatePath(`/${locale}/vehicles/${vehicle.id}`);
	revalidatePath(`/${locale}/vehicles`);
	redirect(`/${locale}/vehicles/${vehicle.id}?tab=settings&updated=1`);
}
