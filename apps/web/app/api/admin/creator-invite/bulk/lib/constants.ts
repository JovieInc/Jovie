/**
 * Bulk Invite Constants
 *
 * Shared constants for the bulk creator invite API.
 */

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const DEFAULT_FIT_SCORE_THRESHOLD = 50;
export const DEFAULT_LIMIT = 50;
export const DEFAULT_MIN_DELAY_MS = 30000; // 30 sec
export const DEFAULT_MAX_DELAY_MS = 120000; // 2 min
export const DEFAULT_MAX_PER_HOUR = 30;
export const MAX_BATCH_LIMIT = 500;
export const PREVIEW_LIMIT = 100;
