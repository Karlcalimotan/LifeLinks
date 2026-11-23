import { describe, expect, it } from "vitest";
import {
	isPlatformAdminEnabled,
	platformAdminDevelopmentMode,
	platformMfaConfigured,
} from "./gate";

describe("platform admin gate", () => {
	it("is closed by default", () => {
		expect(isPlatformAdminEnabled({})).toBe(false);
		expect(isPlatformAdminEnabled({ PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true" })).toBe(false);
	});

	it("stays closed when only the feature flag is set, because MFA is not configured", () => {
		expect(platformMfaConfigured()).toBe(false);
		expect(isPlatformAdminEnabled({ PLATFORM_ADMIN_ENABLED: "true" })).toBe(false);
	});

	it("opens only with the explicit development flag", () => {
		expect(
			isPlatformAdminEnabled({
				PLATFORM_ADMIN_ENABLED: "true",
				PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true",
			}),
		).toBe(true);
	});

	it("does not accept truthy-looking values", () => {
		expect(
			isPlatformAdminEnabled({
				PLATFORM_ADMIN_ENABLED: "1",
				PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "yes",
			}),
		).toBe(false);
	});

	it("reports development mode only when the allow-without-MFA path opened the gate", () => {
		expect(
			platformAdminDevelopmentMode({
				PLATFORM_ADMIN_ENABLED: "true",
				PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true",
			}),
		).toBe(true);
		expect(platformAdminDevelopmentMode({ PLATFORM_ADMIN_ENABLED: "true" })).toBe(false);
		expect(platformAdminDevelopmentMode({})).toBe(false);
	});
});
