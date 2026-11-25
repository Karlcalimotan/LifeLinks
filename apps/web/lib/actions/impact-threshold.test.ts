import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	orgSettings: {
		upsert: vi.fn(),
	},
	auditLog: {
		create: vi.fn(),
	},
	transaction: vi.fn(),
	requireUser: vi.fn(),
	canAdminister: vi.fn(),
	revalidateTag: vi.fn(),
	revalidatePath: vi.fn(),
	redirect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	default: {
		orgSettings: mocks.orgSettings,
		auditLog: mocks.auditLog,
		$transaction: mocks.transaction,
	},
}));

vi.mock("@/lib/auth/session", () => ({
	requireUser: mocks.requireUser,
	canAdminister: mocks.canAdminister,
}));

vi.mock("next/cache", () => ({
	revalidateTag: mocks.revalidateTag,
	revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
	redirect: mocks.redirect,
}));

import { updateImpactThresholdAction } from "./impact-threshold";

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

function form(values: { threshold?: string | null; locale?: string } = {}): FormData {
	const data = new FormData();
	data.set("locale", values.locale ?? "en");
	const threshold = values.threshold === undefined ? "15" : values.threshold;
	if (threshold != null) data.set("threshold", threshold);
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
	mocks.orgSettings.upsert.mockResolvedValue({});
	mocks.auditLog.create.mockResolvedValue({});
	mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
		Promise.all(operations),
	);
	mocks.redirect.mockImplementation((url: string) => {
		throw new RedirectSignal(url);
	});
});

describe("updateImpactThresholdAction", () => {
	it("updates the threshold, audits the change and revalidates the dashboard", async () => {
		const url = await redirectedTo(updateImpactThresholdAction(form()));

		expect(mocks.orgSettings.upsert).toHaveBeenCalledWith({
			where: { orgId: "org-1" },
			create: { orgId: "org-1", impactThresholdG: 15 },
			update: { impactThresholdG: 15 },
		});
		expect(mocks.auditLog.create).toHaveBeenCalledWith({
			data: {
				orgId: "org-1",
				actorId: "user-1",
				action: "settings.impact_threshold.updated",
				target: "org-1",
				metadata: { impactThresholdG: 15 },
			},
		});
		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.revalidateTag).toHaveBeenCalledWith("org-settings", "max");
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/dashboard");
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/settings");
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/devices");
		expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
		expect(url).toBe("/en/dashboard?updated=threshold");
	});

	it("accepts the top of the allowed envelope", async () => {
		const url = await redirectedTo(
			updateImpactThresholdAction(form({ threshold: "16", locale: "tl" })),
		);

		expect(mocks.orgSettings.upsert).toHaveBeenCalledWith({
			where: { orgId: "org-1" },
			create: { orgId: "org-1", impactThresholdG: 16 },
			update: { impactThresholdG: 16 },
		});
		expect(mocks.revalidatePath).toHaveBeenCalledWith("/tl/dashboard");
		expect(url).toBe("/tl/dashboard?updated=threshold");
	});

	it("rejects a non-admin before writing anything", async () => {
		mocks.canAdminister.mockReturnValue(false);

		const url = await redirectedTo(updateImpactThresholdAction(form()));

		expect(url).toBe("/en/dashboard?error=threshold_forbidden");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.orgSettings.upsert).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
		expect(mocks.revalidateTag).not.toHaveBeenCalled();
		expect(mocks.revalidatePath).not.toHaveBeenCalled();
	});

	it("rejects a value below the allowed envelope", async () => {
		const url = await redirectedTo(updateImpactThresholdAction(form({ threshold: "1.4" })));

		expect(url).toBe("/en/dashboard?error=threshold");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.orgSettings.upsert).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("rejects a value above the allowed envelope", async () => {
		const url = await redirectedTo(updateImpactThresholdAction(form({ threshold: "16.1" })));

		expect(url).toBe("/en/dashboard?error=threshold");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.orgSettings.upsert).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});

	it("rejects a non-numeric value", async () => {
		const url = await redirectedTo(
			updateImpactThresholdAction(form({ threshold: "not-a-number" })),
		);

		expect(url).toBe("/en/dashboard?error=threshold");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.orgSettings.upsert).not.toHaveBeenCalled();
	});

	it("rejects a missing value", async () => {
		const url = await redirectedTo(updateImpactThresholdAction(form({ threshold: null })));

		expect(url).toBe("/en/dashboard?error=threshold");
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.orgSettings.upsert).not.toHaveBeenCalled();
		expect(mocks.auditLog.create).not.toHaveBeenCalled();
	});
});
