/**
 * The platform-admin access gate.
 *
 * There is no MFA provider in this deployment. `platformMfaConfigured()` is
 * therefore always false until one is implemented; it is not a fake switch.
 * Access requires `PLATFORM_ADMIN_ENABLED=true` and either a configured MFA
 * provider (future) or the explicit `PLATFORM_ADMIN_ALLOW_WITHOUT_MFA=true`
 * development flag. Real customer deployments require MFA, so the
 * allow-without-MFA path must stay off outside development.
 *
 * This module is deliberately free of server-only imports so the policy can be
 * unit-tested.
 */
export interface PlatformAdminEnv {
	[key: string]: string | undefined;
	NODE_ENV?: string;
	PLATFORM_ADMIN_ENABLED?: string;
	PLATFORM_ADMIN_ALLOW_WITHOUT_MFA?: string;
}

/**
 * No MFA provider exists yet. Keep this false and implement the real check
 * here when one is added; do not replace it with an environment flag that
 * claims MFA is configured when it is not.
 */
export function platformMfaConfigured(): boolean {
	return false;
}

/**
 * True only when both the feature flag and an acceptable second factor path are
 * on. The allow-without-MFA shortcut is refused in production: a production
 * build must use real MFA, not a development flag.
 */
export function isPlatformAdminEnabled(env: PlatformAdminEnv = process.env): boolean {
	if (env.PLATFORM_ADMIN_ENABLED !== "true") return false;
	if (platformMfaConfigured()) return true;
	if (env.NODE_ENV === "production") return false;
	return env.PLATFORM_ADMIN_ALLOW_WITHOUT_MFA === "true";
}

/**
 * Honest banner state: the console is enabled only because the development
 * allow-without-MFA flag is set. Never use this configuration with real
 * customer data.
 */
export function platformAdminDevelopmentMode(env: PlatformAdminEnv = process.env): boolean {
	return (
		isPlatformAdminEnabled(env) &&
		!platformMfaConfigured() &&
		env.PLATFORM_ADMIN_ALLOW_WITHOUT_MFA === "true"
	);
}
