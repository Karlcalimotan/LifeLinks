/** Tracker list page size and the largest bulk selection that page can produce. */
export const DEVICE_PAGE_SIZE = 20;

/**
 * Bulk approval is bounded to one page. Keep this derived from the page size so
 * a future pagination change cannot leave the server accepting a wider
 * selection than the UI can show.
 */
export const BULK_APPROVE_MAX = DEVICE_PAGE_SIZE;

/**
 * Token rotation is destructive for the tracker holding the old token, so an
 * admin gets a small fixed window per tracker. The limiter is in-process; a
 * multi-instance deployment needs a shared store.
 */
export const TOKEN_ROTATION_RATE_LIMIT = { limit: 5, windowMs: 10 * 60_000 } as const;
