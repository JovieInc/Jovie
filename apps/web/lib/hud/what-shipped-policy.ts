/**
 * Cost and freshness policy for the GitHub-backed "What shipped" feed.
 *
 * Keep the server cache materially longer than the client poll. Matching the
 * two intervals makes every poll a cache miss and, with ten title lookups per
 * refresh, one always-open HUD can exceed Upstash's 500,000-request free tier.
 */
export const WHAT_SHIPPED_POLL_MS = 60_000;
export const WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS = 5 * 60;
export const WHAT_SHIPPED_MAX_ITEMS = 10;
