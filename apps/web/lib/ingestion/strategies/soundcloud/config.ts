/**
 * SoundCloud Pro Badge Detection Config
 *
 * Uses SoundCloud API v2 (public, no auth required) to detect Pro subscription status.
 * The API returns structured JSON with badges and subscription data.
 */

/** SoundCloud API v2 client ID (extracted from SC web app JS bundles) */
export const SOUNDCLOUD_CLIENT_ID = 'WU4bVxk5Df0g5JC8ULzW77Ry7OM10Lyj';

/** SoundCloud API v2 resolve endpoint */
export const SOUNDCLOUD_API_BASE = 'https://api-v2.soundcloud.com';

export const SOUNDCLOUD_FETCH_CONFIG = {
  /** Request timeout in ms */
  timeoutMs: 10_000,
  /** User agent for API requests */
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
} as const;

/** SoundCloud subscription product IDs that indicate a paid tier */
export const SOUNDCLOUD_PAID_PRODUCT_IDS = new Set([
  'creator-pro',
  'creator-pro-unlimited',
  'creator-next-pro',
]);

/**
 * Map SoundCloud product IDs to tier names for storage.
 */
export const SOUNDCLOUD_TIER_MAP: Record<string, string> = {
  'creator-pro': 'pro',
  'creator-pro-unlimited': 'pro_unlimited',
  'creator-next-pro': 'next_pro',
};
