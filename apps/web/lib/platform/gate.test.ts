import { describe, expect, it } from "vitest";
import {
	isPlatformAdminEnabled,
	platformAdminDevelopmentMode,
	platformMfaConfigured,
} from "./gate";

describe("platform admin gate", () => {
	it("is closed by default", () => {
		expect(isPlatformAdminEnabled({ NODE_ENV: "development" })).toBe(false);
		expect(
			isPlatformAdminEnabled({
				NODE_ENV: "development",
				PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true",
			}),
		).toBe(false);
	});

	it("stays closed when only the feature flag is set, because MFA is not configured", () => {
		expect(platformMfaConfigured()).toBe(false);
		expect(
			isPlatformAdminEnabled({ NODE_ENV: "development", PLATFORM_ADMIN_ENABLED: "true" }),
		).toBe(false);
	});

	it("opens with the explicit development flag in development and test", () => {
		for (const nodeEnv of ["development", "test"]) {
			expect(
				isPlatformAdminEnabled({
					NODE_ENV: nodeEnv,
					PLATFORM_ADMIN_ENABLED: "true",
					PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true",
				}),
			).toBe(true);
		}
	});

	it("refuses the allow-without-MFA flag in production", () => {
		expect(
			isPlatformAdminEnabled({
				NODE_ENV: "production",
				PLATFORM_ADMIN_ENABLED: "true",
				PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true",
			}),
		).toBe(false);
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
				NODE_ENV: "development",
				PLATFORM_ADMIN_ENABLED: "true",
				PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true",
			}),
		).toBe(true);
		expect(
			platformAdminDevelopmentMode({ NODE_ENV: "development", PLATFORM_ADMIN_ENABLED: "true" }),
		).toBe(false);
		expect(platformAdminDevelopmentMode({ NODE_ENV: "development" })).toBe(false);
		expect(
			platformAdminDevelopmentMode({
				NODE_ENV: "production",
				PLATFORM_ADMIN_ENABLED: "true",
				PLATFORM_ADMIN_ALLOW_WITHOUT_MFA: "true",
			}),
		).toBe(false);
	});
});
