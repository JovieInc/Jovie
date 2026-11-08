export const DEFAULT_DM_TEMPLATE =
  "Hey {displayName}! I found your Linktree and built Jovie to give creators a better link-in-bio. Here's your free page: {claimLink}";

// Quiet hours for outbound sends, in whole UTC hours. Leads carry no
// recipient timezone, so the default send window (15:00-01:00 UTC) lands
// inside 8am-9pm local for US recipients on both coasts.
export const OUTREACH_QUIET_HOURS_START_UTC = 1;
export const OUTREACH_QUIET_HOURS_END_UTC = 15;

export const LEAD_QUALIFICATION_CONCURRENCY = 3;

export const LINKTREE_FETCH_DELAY_MS = 1000;

export const SEARCH_API_TIMEOUT_MS = 8_000;
export const SEARCH_API_MAX_RETRIES = 2;
export const SEARCH_API_RETRY_BASE_DELAY_MS = 500;

/**
 * List price of one discovery search, for the per-lead cost counter only (no
 * billing logic reads it). SerpAPI Developer plan: $75 / 5,000 searches.
 * Exa search: $5 / 1,000 requests. Update when the plan changes.
 */
export const SEARCH_QUERY_COST_USD = {
  serpapi: 0.015,
  exa: 0.005,
  none: 0,
} as const;
