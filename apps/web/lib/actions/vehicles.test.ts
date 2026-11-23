import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	vehicle: {
		findFirst: vi.fn(),
		update: vi.fn(),
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

import { setMaintenanceModeAction } from "./vehicles";

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
