/** Platform-wide constants. Keep policy values in OrgSettings, not here. */

export const APP_NAME = "LifeLink";
export const APP_TAGLINE = "Crash detection and emergency response for every vehicle.";

export const SESSION_COOKIE = "lifelink_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * The platform console uses its own cookie. A tenant session can never be
 * replayed as a platform session (and the platform JWT carries no orgId or
 * role, so the reverse is also impossible).
 */
export const PLATFORM_SESSION_COOKIE = "lifelink_platform_session";

export const DEVICE_TOKEN_HEADER = "x-device-token";
export const DEVICE_TOKEN_PREFIX = "llk_";

/** Device is weak after a missed heartbeat, offline after this many minutes. */
export const DEVICE_WEAK_AFTER_MIN = 2;
export const DEVICE_OFFLINE_AFTER_MIN = 5;

/** A GPS fix older than this is shown as stale, but never blocks an SOS. */
export const GPS_STALE_AFTER_S = 120;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
