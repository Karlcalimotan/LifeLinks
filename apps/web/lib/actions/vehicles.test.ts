import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	vehicle: {
		findFirst: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
	membership: {
		findFirst: vi.fn(),
	},
	auditLog: {
		create: vi.fn(),
	},
	transaction: vi.fn(),
	requireUser: vi.fn(),
	canAdminister: vi.fn(),
	revalidatePath: vi.fn(),
	redirect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		vehicle: mocks.vehicle,
		membership: mocks.membership,
		auditLog: mocks.auditLog,
		$transaction: mocks.transaction,
	},
}));

vi.mock("@/lib/auth/session", () => ({
	requireUser: mocks.requireUser,
	canAdminister: mocks.canAdminister,
}));

vi.mock("next/cache", () => ({
	revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
	redirect: mocks.redirect,
}));

import {
	archiveVehicleAction,
	createVehicleAction,
	setMaintenanceModeAction,
	updateVehicleAction,
} from "./vehicles";

class RedirectSignal extends Error {
	constructor(readonly url: string) {
		super(`redirect:${url}`);
	}
}

async function redirectedTo(run: Promise<unknown>): Promise<string> {
	try {
		await run;
	} catch (error) {
		if (error instanceof RedirectSignal) return error.url;
		throw error;
	}
	throw new Error("Expected the action to redirect.");
}

function form(values: { vehicleId?: string; action?: string; locale?: string } = {}): FormData {
	const data = new FormData();
	data.set("locale", values.locale ?? "en");
	data.set("vehicleId", values.vehicleId ?? "vehicle-1");
	data.set("action", values.action ?? "enable");
	return data;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({
		user: { id: "user-1" },
		org: { id: "org-1" },
		role: "ADMIN",
	});
	mocks.canAdminister.mockReturnValue(true);
	mocks.vehicle.findFirst.mockResolvedValue({
		id: "vehicle-1",
		plateNo: "ABC 1234",
		status: "ACTIVE",
	});
	mocks.vehicle.update.mockResolvedValue({});
	mocks.vehicle.create.mockResolvedValue({});
	mocks.membership.findFirst.mockResolvedValue(null);
	mocks.auditLog.create.mockResolvedValue({});
	mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
		Promise.all(operations),
	);
	mocks.redirect.mockImplementation((url: string) => {
		throw new RedirectSignal(url);
	});
});

describe("setMaintenanceModeAction", () => {
	it("moves an active vehicle into maintenance and audits the change", async () => {
		const url = await redirectedTo(setMaintenanceModeAction(form()));

		expect(mocks.vehicle.findFirst).toHaveBeenCalledWith({
			where: { id: "vehicle-1", orgId: "org-1" },
			select: { id: true, plateNo: true, status: true },
		});
		expect(mocks.vehicle.update).toHaveBeenCalledWith({
			where: { id: "vehicle-1" },
			data: { status: "MAINTENANCE" },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-1",
				action: "vehicle.maintenance",
				target: "vehicle-1",
				metadata: { plateNo: "ABC 1234", from: "ACTIVE", to: "MAINTENANCE" },
			},
		});
		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/vehicles/vehicle-1");
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/vehicles");
		expect(url).toBe("/en/vehicles/vehicle-1?tab=settings&updated=1");
	});

	it("returns a vehicle in maintenance to active service", async () => {
		mocks.vehicle.findFirst.mockResolvedValue({
			id: "vehicle-1",
			plateNo: "ABC 1234",
			status: "MAINTENANCE",
		});

		const url = await redirectedTo(
			setMaintenanceModeAction(form({ action: "disable", locale: "tl" })),
		);

		expect(mocks.vehicle.update).toHaveBeenCalledWith({
			where: { id: "vehicle-1" },
			data: { status: "ACTIVE" },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				metadata: { plateNo: "ABC 1234", from: "MAINTENANCE", to: "ACTIVE" },
			}),
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/tl/vehicles/vehicle-1");
		expect(url).toBe("/tl/vehicles/vehicle-1?tab=settings&updated=1");
	});

	it("rejects a non-admin before reading the vehicle", async () => {
		mocks.canAdminister.mockReturnValue(false);

		const url = await redirectedTo(setMaintenanceModeAction(form()));

		expect(url).toBe("/en/vehicles/vehicle-1?tab=settings&error=forbidden");
		expect(mocks.vehicle.findFirst).not.toHaveBeenCalled();
		expect(mocks.vehicle.update).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("rejects a vehicle outside the current organization", async () => {
		mocks.vehicle.findFirst.mockResolvedValue(null);

		const url = await redirectedTo(setMaintenanceModeAction(form()));

		expect(url).toBe("/en/vehicles?error=notfound");
		expect(mocks.vehicle.update).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("rejects a transition that would not change the status", async () => {
		const url = await redirectedTo(setMaintenanceModeAction(form({ action: "disable" })));

		expect(url).toBe("/en/vehicles/vehicle-1?tab=settings&error=status");
		expect(mocks.vehicle.update).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("rejects a retired vehicle", async () => {
		mocks.vehicle.findFirst.mockResolvedValue({
			id: "vehicle-1",
			plateNo: "ABC 1234",
			status: "RETIRED",
		});

		const url = await redirectedTo(setMaintenanceModeAction(form()));

		expect(url).toBe("/en/vehicles/vehicle-1?tab=settings&error=status");
		expect(mocks.vehicle.update).not.toHaveBeenCalled();
	});

	it("rejects an unknown action before touching the database", async () => {
		const url = await redirectedTo(setMaintenanceModeAction(form({ action: "delete" })));

		expect(url).toBe("/en/vehicles/vehicle-1?tab=settings&error=invalid");
		expect(mocks.vehicle.findFirst).not.toHaveBeenCalled();
	});
});

const createdVehicle = {
	id: "vehicle-2",
	plateNo: "ABC 1234",
	make: "Toyota",
	model: "Hilux",
	year: 2020,
	vin: null,
	driverName: "Ana",
	driverPhone: "+639171234567",
	ownerId: "user-1",
	status: "ACTIVE",
};

function vehicleForm(values: Record<string, string> = {}): FormData {
	const data = new FormData();
	const fields: Record<string, string> = {
		locale: "en",
		plateNo: "ABC 1234",
		make: "Toyota",
		model: "Hilux",
		year: "2020",
		vin: "",
		driverName: "Ana",
		driverPhone: "+63 917 123 4567",
		ownerId: "",
		...values,
	};
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

describe("createVehicleAction", () => {
	it("forces a USER owner to the caller and audits the created vehicle", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});
		mocks.vehicle.findFirst.mockResolvedValue(null);
		mocks.vehicle.create.mockResolvedValue(createdVehicle);

		const state = await createVehicleAction({ ok: false }, vehicleForm());

		expect(state).toEqual({ ok: true, vehicleId: "vehicle-2" });
		expect(mocks.vehicle.findFirst).toHaveBeenCalledWith({
			where: { orgId: "org-1", plateNo: "ABC 1234" },
			select: { id: true },
		});
		expect(mocks.vehicle.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				ownerId: "user-1",
				plateNo: "ABC 1234",
				make: "Toyota",
				model: "Hilux",
				year: 2020,
				vin: null,
				driverName: "Ana",
				driverPhone: "+639171234567",
			},
			select: expect.any(Object),
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-1",
				action: "vehicle.created",
				target: "vehicle-2",
				metadata: {
					plateNo: "ABC 1234",
					before: null,
					after: {
						plateNo: "ABC 1234",
						make: "Toyota",
						model: "Hilux",
						year: 2020,
						vin: null,
						driverName: "Ana",
						driverPhone: "+639171234567",
						ownerId: "user-1",
						status: "ACTIVE",
					},
				},
			},
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/vehicles");
	});

	it("refuses a USER who tries to register a vehicle for another user", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});

		const state = await createVehicleAction({ ok: false }, vehicleForm({ ownerId: "user-2" }));

		expect(state.ok).toBe(false);
		expect(state.error).toBe("forbidden");
		expect(state.fieldErrors?.ownerId).toBeDefined();
		expect(mocks.vehicle.findFirst).not.toHaveBeenCalled();
		expect(mocks.vehicle.create).not.toHaveBeenCalled();
	});

	it("lets an ADMIN assign an active member of the organization", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "admin-1" },
			org: { id: "org-1" },
			role: "ADMIN",
		});
		mocks.membership.findFirst.mockResolvedValue({ userId: "user-2" });
		mocks.vehicle.findFirst.mockResolvedValue(null);
		mocks.vehicle.create.mockResolvedValue({ ...createdVehicle, ownerId: "user-2" });

		const state = await createVehicleAction({ ok: false }, vehicleForm({ ownerId: "user-2" }));

		expect(state).toEqual({ ok: true, vehicleId: "vehicle-2" });
		expect(mocks.membership.findFirst).toHaveBeenCalledWith({
			where: { orgId: "org-1", userId: "user-2", revokedAt: null },
			select: { userId: true },
		});
		expect(mocks.vehicle.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ ownerId: "user-2" }),
			}),
		);
	});

	it("refuses an owner from another organization", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "admin-1" },
			org: { id: "org-1" },
			role: "ADMIN",
		});
		mocks.membership.findFirst.mockResolvedValue(null);

		const state = await createVehicleAction(
			{ ok: false },
			vehicleForm({ ownerId: "other-org-user" }),
		);

		expect(state.ok).toBe(false);
		expect(state.error).toBe("owner");
		expect(mocks.vehicle.create).not.toHaveBeenCalled();
	});

	it("refuses a duplicate plate before creating the row", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});
		mocks.vehicle.findFirst.mockResolvedValue({ id: "vehicle-1" });

		const state = await createVehicleAction({ ok: false }, vehicleForm());

		expect(state.ok).toBe(false);
		expect(state.fieldErrors?.plateNo).toBeDefined();
		expect(mocks.vehicle.create).not.toHaveBeenCalled();
	});

	it("refuses a RESPONDER", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "responder-1" },
			org: { id: "org-1" },
			role: "RESPONDER",
		});

		const state = await createVehicleAction({ ok: false }, vehicleForm());

		expect(state).toEqual({ ok: false, error: "forbidden" });
		expect(mocks.vehicle.findFirst).not.toHaveBeenCalled();
	});
});

describe("updateVehicleAction", () => {
	it("scopes a USER to their own vehicle", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});
		mocks.vehicle.findFirst.mockResolvedValue(createdVehicle);
		mocks.vehicle.update.mockResolvedValue(createdVehicle);

		const state = await updateVehicleAction(
			{ ok: false },
			vehicleForm({ vehicleId: "vehicle-2", ownerId: "user-1" }),
		);

		expect(state).toEqual({ ok: true, vehicleId: "vehicle-2" });
		expect(mocks.vehicle.findFirst).toHaveBeenCalledWith({
			where: { id: "vehicle-2", orgId: "org-1", ownerId: "user-1" },
			select: expect.any(Object),
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "vehicle.updated",
				metadata: expect.objectContaining({
					before: expect.objectContaining({ plateNo: "ABC 1234" }),
					after: expect.objectContaining({ plateNo: "ABC 1234" }),
				}),
			}),
		});
	});

	it("reports another owner's vehicle as not found", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});
		mocks.vehicle.findFirst.mockResolvedValue(null);

		const state = await updateVehicleAction({ ok: false }, vehicleForm({ vehicleId: "vehicle-9" }));

		expect(state).toEqual({ ok: false, error: "notfound" });
		expect(mocks.vehicle.update).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("refuses ownership escalation by a USER", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});
		mocks.vehicle.findFirst.mockResolvedValue(createdVehicle);

		const state = await updateVehicleAction(
			{ ok: false },
			vehicleForm({ vehicleId: "vehicle-2", ownerId: "user-2" }),
		);

		expect(state.ok).toBe(false);
		expect(state.error).toBe("forbidden");
		expect(state.fieldErrors?.ownerId).toBeDefined();
		expect(mocks.vehicle.update).not.toHaveBeenCalled();
	});

	it("lets an ADMIN reassign the vehicle and records before and after", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "admin-1" },
			org: { id: "org-1" },
			role: "ADMIN",
		});
		mocks.vehicle.findFirst.mockResolvedValue(createdVehicle);
		mocks.membership.findFirst.mockResolvedValue({ userId: "user-2" });
		mocks.vehicle.update.mockResolvedValue({ ...createdVehicle, ownerId: "user-2" });

		const state = await updateVehicleAction(
			{ ok: false },
			vehicleForm({ vehicleId: "vehicle-2", ownerId: "user-2" }),
		);

		expect(state).toEqual({ ok: true, vehicleId: "vehicle-2" });
		expect(mocks.vehicle.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "vehicle-2" },
				data: expect.objectContaining({ ownerId: "user-2" }),
			}),
		);
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "vehicle.updated",
				metadata: {
					plateNo: "ABC 1234",
					before: {
						plateNo: "ABC 1234",
						make: "Toyota",
						model: "Hilux",
						year: 2020,
						vin: null,
						driverName: "Ana",
						driverPhone: "+639171234567",
						ownerId: "user-1",
						status: "ACTIVE",
					},
					after: {
						plateNo: "ABC 1234",
						make: "Toyota",
						model: "Hilux",
						year: 2020,
						vin: null,
						driverName: "Ana",
						driverPhone: "+639171234567",
						ownerId: "user-2",
						status: "ACTIVE",
					},
				},
			}),
		});
	});

	it("refuses an owner from another organization", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "admin-1" },
			org: { id: "org-1" },
			role: "ADMIN",
		});
		mocks.vehicle.findFirst.mockResolvedValue(createdVehicle);
		mocks.membership.findFirst.mockResolvedValue(null);

		const state = await updateVehicleAction(
			{ ok: false },
			vehicleForm({ vehicleId: "vehicle-2", ownerId: "other-org-user" }),
		);

		expect(state.ok).toBe(false);
		expect(state.error).toBe("owner");
		expect(mocks.vehicle.update).not.toHaveBeenCalled();
	});
});

describe("archiveVehicleAction", () => {
	it("archives a USER's own vehicle instead of deleting it", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "user-1" },
			org: { id: "org-1" },
			role: "USER",
		});
		mocks.vehicle.findFirst.mockResolvedValue({
			id: "vehicle-2",
			plateNo: "ABC 1234",
			status: "ACTIVE",
		});

		const data = new FormData();
		data.set("locale", "en");
		data.set("vehicleId", "vehicle-2");

		await redirectedTo(archiveVehicleAction(data));

		expect(mocks.vehicle.findFirst).toHaveBeenCalledWith({
			where: { id: "vehicle-2", orgId: "org-1", ownerId: "user-1" },
			select: { id: true, plateNo: true, status: true },
		});
		expect(mocks.vehicle.update).toHaveBeenCalledWith({
			where: { id: "vehicle-2" },
			data: { status: "RETIRED" },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-1",
				action: "vehicle.archived",
				target: "vehicle-2",
				metadata: { plateNo: "ABC 1234", from: "ACTIVE", to: "RETIRED" },
			},
		});
		expect(mocks.redirect).toHaveBeenCalledWith("/en/vehicles/vehicle-2?tab=settings&updated=1");
	});
});
