/** Tracker list page size and the largest bulk selection that page can produce. */
export const DEVICE_PAGE_SIZE = 20;

/**
 * Bulk approval is bounded to one page. Keep this derived from the page size so
 * a future pagination change cannot leave the server accepting a wider
 * selection than the UI can show.
 */
export const BULK_APPROVE_MAX = DEVICE_PAGE_SIZE;
