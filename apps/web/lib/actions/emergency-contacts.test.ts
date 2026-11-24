import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	contact: {
		findFirst: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
	vehicle: {
		findFirst: vi.fn(),
	},
	auditLog: {
		create: vi.fn(),
	},
	transaction: vi.fn(),
	requireUser: vi.fn(),
	revalidatePath: vi.fn(),
	redirect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		emergencyContact: mocks.contact,
		vehicle: mocks.vehicle,
		auditLog: mocks.auditLog,
		$transaction: mocks.transaction,
	},
}));

vi.mock("@/lib/auth/session", () => ({
	requireUser: mocks.requireUser,
}));

vi.mock("next/cache", () => ({
	revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
	redirect: mocks.redirect,
}));

import {
	archiveEmergencyContactAction,
	createEmergencyContactAction,
	updateEmergencyContactAction,
} from "./emergency-contacts";

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

const contactRow = {
	id: "contact-1",
	name: "Maria Cruz",
	phone: "+639171112222",
	email: "maria@example.com",
	active: true,
	vehicleId: "veh-1",
};

function contactForm(values: Record<string, string> = {}): FormData {
	const data = new FormData();
	const fields: Record<string, string> = {
		locale: "en",
		name: "Maria Cruz",
		phone: "+63 917 111 2222",
		email: "maria@example.com",
		vehicleId: "veh-1",
		active: "on",
		...values,
	};
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

const user = { user: { id: "user-1" }, org: { id: "org-1" }, role: "USER" };
const admin = { user: { id: "admin-1" }, org: { id: "org-1" }, role: "ADMIN" };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue(user);
	mocks.contact.findFirst.mockReset();
	mocks.contact.findFirst.mockResolvedValue(null);
	mocks.contact.create.mockResolvedValue(contactRow);
	mocks.contact.update.mockResolvedValue(contactRow);
	mocks.vehicle.findFirst.mockResolvedValue({ id: "veh-1" });
	mocks.auditLog.create.mockResolvedValue({});
	mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
		Promise.all(operations),
	);
	mocks.redirect.mockImplementation((url: string) => {
		throw new RedirectSignal(url);
	});
});

describe("createEmergencyContactAction", () => {
	it("lets a USER add a contact to their own vehicle and audits it", async () => {
		const state = await createEmergencyContactAction({ ok: false }, contactForm());

		expect(state).toEqual({ ok: true, contactId: "contact-1" });
		expect(mocks.vehicle.findFirst).toHaveBeenCalledWith({
			where: { id: "veh-1", orgId: "org-1", ownerId: "user-1" },
			select: { id: true },
		});
		expect(mocks.contact.findFirst).toHaveBeenCalledWith({
			where: { orgId: "org-1", phone: "+639171112222" },
			select: { id: true },
		});
		expect(mocks.contact.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				vehicleId: "veh-1",
				name: "Maria Cruz",
				phone: "+639171112222",
				email: "maria@example.com",
				active: true,
			},
			select: {
				id: true,
				name: true,
				phone: true,
				email: true,
				active: true,
				vehicleId: true,
			},
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-1",
				action: "emergency_contact.created",
				target: "contact-1",
				metadata: {
					before: null,
					after: {
						name: "Maria Cruz",
						phone: "+639171112222",
						email: "maria@example.com",
						active: true,
						vehicleId: "veh-1",
					},
				},
			},
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/vehicles/veh-1");
	});

	it("refuses a vehicle owned by another user", async () => {
		mocks.vehicle.findFirst.mockResolvedValue(null);

		const state = await createEmergencyContactAction({ ok: false }, contactForm());

		expect(state.ok).toBe(false);
		expect(state.error).toBe("vehicle");
		expect(mocks.contact.findFirst).not.toHaveBeenCalled();
		expect(mocks.contact.create).not.toHaveBeenCalled();
	});

	it("refuses a USER who tries to create an organisation-level contact", async () => {
		const state = await createEmergencyContactAction({ ok: false }, contactForm({ vehicleId: "" }));

		expect(state.ok).toBe(false);
		expect(state.error).toBe("forbidden");
		expect(mocks.vehicle.findFirst).not.toHaveBeenCalled();
		expect(mocks.contact.create).not.toHaveBeenCalled();
	});

	it("lets an ADMIN create an organisation-level contact", async () => {
		mocks.requireUser.mockResolvedValue(admin);
		mocks.contact.create.mockResolvedValue({ ...contactRow, vehicleId: null });
		mocks.contact.findFirst.mockResolvedValue(null);

		const state = await createEmergencyContactAction({ ok: false }, contactForm({ vehicleId: "" }));

		expect(state).toEqual({ ok: true, contactId: "contact-1" });
		expect(mocks.vehicle.findFirst).not.toHaveBeenCalled();
		expect(mocks.contact.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ orgId: "org-1", vehicleId: null }),
			}),
		);
	});

	it("refuses a duplicate phone in the organization", async () => {
		mocks.contact.findFirst.mockResolvedValue({ id: "contact-9" });

		const state = await createEmergencyContactAction({ ok: false }, contactForm());

		expect(state.ok).toBe(false);
		expect(state.error).toBe("duplicate");
		expect(state.fieldErrors?.phone).toBeDefined();
		expect(mocks.contact.create).not.toHaveBeenCalled();
	});

	it("refuses a RESPONDER", async () => {
		mocks.requireUser.mockResolvedValue({
			user: { id: "responder-1" },
			org: { id: "org-1" },
			role: "RESPONDER",
		});

		const state = await createEmergencyContactAction({ ok: false }, contactForm());

		expect(state).toEqual({ ok: false, error: "forbidden" });
		expect(mocks.vehicle.findFirst).not.toHaveBeenCalled();
	});
});

describe("updateEmergencyContactAction", () => {
	it("scopes a USER to contacts on their own vehicles", async () => {
		mocks.contact.findFirst.mockResolvedValueOnce(contactRow).mockResolvedValueOnce(null);

		const state = await updateEmergencyContactAction(
			{ ok: false },
			contactForm({ contactId: "contact-1", name: "Maria Santos" }),
		);

		expect(state).toEqual({ ok: true, contactId: "contact-1" });
		expect(mocks.contact.findFirst).toHaveBeenNthCalledWith(1, {
			where: { id: "contact-1", orgId: "org-1", vehicle: { ownerId: "user-1" } },
			select: {
				id: true,
				name: true,
				phone: true,
				email: true,
				active: true,
				vehicleId: true,
			},
		});
		expect(mocks.vehicle.findFirst).toHaveBeenCalledWith({
			where: { id: "veh-1", orgId: "org-1", ownerId: "user-1" },
			select: { id: true },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "emergency_contact.updated",
				metadata: {
					before: {
						name: "Maria Cruz",
						phone: "+639171112222",
						email: "maria@example.com",
						active: true,
						vehicleId: "veh-1",
					},
					after: {
						name: "Maria Santos",
						phone: "+639171112222",
						email: "maria@example.com",
						active: true,
						vehicleId: "veh-1",
					},
				},
			}),
		});
	});

	it("reports another owner's contact as not found", async () => {
		mocks.contact.findFirst.mockResolvedValue(null);

		const state = await updateEmergencyContactAction(
			{ ok: false },
			contactForm({ contactId: "contact-9" }),
		);

		expect(state).toEqual({ ok: false, error: "notfound" });
		expect(mocks.contact.update).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("lets an ADMIN edit any contact in the organization", async () => {
		mocks.requireUser.mockResolvedValue(admin);
		mocks.contact.findFirst
			.mockResolvedValueOnce({ ...contactRow, vehicleId: null })
			.mockResolvedValueOnce(null);

		const state = await updateEmergencyContactAction(
			{ ok: false },
			contactForm({ contactId: "contact-1", vehicleId: "" }),
		);

		expect(state).toEqual({ ok: true, contactId: "contact-1" });
		expect(mocks.contact.findFirst).toHaveBeenNthCalledWith(1, {
			where: { id: "contact-1", orgId: "org-1" },
			select: {
				id: true,
				name: true,
				phone: true,
				email: true,
				active: true,
				vehicleId: true,
			},
		});
		expect(mocks.contact.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "contact-1" },
				data: expect.objectContaining({ vehicleId: null }),
			}),
		);
	});

	it("refuses moving a contact to another owner's vehicle", async () => {
		mocks.contact.findFirst.mockResolvedValueOnce(contactRow).mockResolvedValueOnce(null);
		mocks.vehicle.findFirst.mockResolvedValue(null);

		const state = await updateEmergencyContactAction(
			{ ok: false },
			contactForm({ contactId: "contact-1", vehicleId: "veh-2" }),
		);

		expect(state.ok).toBe(false);
		expect(state.error).toBe("vehicle");
		expect(mocks.contact.update).not.toHaveBeenCalled();
	});
});

describe("archiveEmergencyContactAction", () => {
	it("archives a contact on the caller's vehicle and audits before and after", async () => {
		mocks.contact.findFirst.mockResolvedValue(contactRow);

		const data = new FormData();
		data.set("locale", "en");
		data.set("contactId", "contact-1");

		const url = await redirectedTo(archiveEmergencyContactAction(data));

		expect(mocks.contact.findFirst).toHaveBeenCalledWith({
			where: { id: "contact-1", orgId: "org-1", vehicle: { ownerId: "user-1" } },
			select: {
				id: true,
				name: true,
				phone: true,
				email: true,
				active: true,
				vehicleId: true,
			},
		});
		expect(mocks.contact.update).toHaveBeenCalledWith({
			where: { id: "contact-1" },
			data: { active: false },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-1",
				action: "emergency_contact.archived",
				target: "contact-1",
				metadata: {
					before: {
						name: "Maria Cruz",
						phone: "+639171112222",
						email: "maria@example.com",
						active: true,
						vehicleId: "veh-1",
					},
					after: {
						name: "Maria Cruz",
						phone: "+639171112222",
						email: "maria@example.com",
						active: false,
						vehicleId: "veh-1",
					},
				},
			},
		});
		expect(url).toBe("/en/vehicles/veh-1?tab=settings&archived=1");
	});

	it("refuses another owner's contact", async () => {
		mocks.contact.findFirst.mockResolvedValue(null);

		const data = new FormData();
		data.set("locale", "en");
		data.set("contactId", "contact-9");

		const url = await redirectedTo(archiveEmergencyContactAction(data));

		expect(url).toBe("/en/vehicles?error=notfound");
		expect(mocks.contact.update).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});
});
