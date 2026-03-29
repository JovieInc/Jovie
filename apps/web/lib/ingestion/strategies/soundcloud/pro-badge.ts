/**
 * SoundCloud Pro Badge Detection
 *
 * Detects whether a SoundCloud artist has a Pro/Pro Unlimited/Next Pro subscription
 * by querying SoundCloud's public API v2. Returns structured badge and subscription data.
 */

import {
  SOUNDCLOUD_API_BASE,
  SOUNDCLOUD_CLIENT_ID,
  SOUNDCLOUD_FETCH_CONFIG,
  SOUNDCLOUD_PAID_PRODUCT_IDS,
  SOUNDCLOUD_TIER_MAP,
} from './config';

export interface SoundCloudProResult {
  /** Whether the artist has a paid SoundCloud subscription */
  isPro: boolean | null;
  /** The specific tier if detected */
  tier: string | null;
  /** The raw product ID from the API */
  productId: string | null;
}

interface SoundCloudBadges {
  pro?: boolean;
  pro_unlimited?: boolean;
  creator_mid_tier?: boolean;
  verified?: boolean;
}

interface SoundCloudApiUser {
  badges?: SoundCloudBadges;
  creator_subscription?: {
    product?: {
      id?: string;
    };
  };
  creator_subscriptions?: Array<{
    product?: {
      id?: string;
    };
  }>;
}

/**
 * Detect SoundCloud Pro status from API response data.
 * Pure function, no side effects.
 *
 * @param userData - Parsed user data from SoundCloud API v2
 * @returns Detection result with isPro, tier, and productId
 */
export function detectSoundCloudProFromApiData(
  userData: SoundCloudApiUser | null
): SoundCloudProResult {
  if (!userData) {
    return { isPro: null, tier: null, productId: null };
  }

  // Check subscription product ID (most reliable)
  // Check creator_subscription first, then iterate creator_subscriptions array
  const productId =
    userData.creator_subscription?.product?.id ??
    userData.creator_subscriptions?.find(
      s => s.product?.id && SOUNDCLOUD_PAID_PRODUCT_IDS.has(s.product.id)
    )?.product?.id ??
    userData.creator_subscriptions?.[0]?.product?.id ??
    null;

  if (productId && SOUNDCLOUD_PAID_PRODUCT_IDS.has(productId)) {
    return {
      isPro: true,
      tier: SOUNDCLOUD_TIER_MAP[productId] ?? productId,
      productId,
    };
  }

  // Fallback: check badge flags
  const badges = userData.badges;
  if (badges) {
    if (badges.pro_unlimited) {
      return { isPro: true, tier: 'pro_unlimited', productId };
    }
    if (badges.pro) {
      return { isPro: true, tier: 'pro', productId };
    }
    if (badges.creator_mid_tier) {
      return { isPro: true, tier: 'creator_mid_tier', productId };
    }
  }

  // Explicit negative: we got a valid response but no Pro indicators
  if (productId === 'free' || badges) {
    return { isPro: false, tier: null, productId };
  }

  // Can't determine (missing data)
  return { isPro: null, tier: null, productId: null };
}

/**
 * Normalize a SoundCloud slug, stripping URL prefixes and query params.
 */
export function normalizeSoundCloudSlug(input: string): string {
  const stripped = input
    .replace(/^https?:\/\/(www\.)?soundcloud\.com\//i, '')
    .replace(/[?#].*$/, '') // Strip query params and hash fragments
    .replace(/\/+$/, '');
  return stripped;
}

/**
 * Fetch SoundCloud user data and detect Pro status.
 *
 * @param slug - SoundCloud username/slug (e.g., "deadmau5")
 * @returns Detection result, or null isPro if fetch fails
 */
export async function fetchAndDetectSoundCloudPro(
  slug: string
): Promise<SoundCloudProResult> {
  const normalizedSlug = normalizeSoundCloudSlug(slug);
  if (!normalizedSlug || normalizedSlug.includes('/')) {
    // Invalid slug (empty or contains path segments)
    return { isPro: null, tier: null, productId: null };
  }

  const url = `${SOUNDCLOUD_API_BASE}/resolve?url=https://soundcloud.com/${encodeURIComponent(normalizedSlug)}&client_id=${SOUNDCLOUD_CLIENT_ID}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': SOUNDCLOUD_FETCH_CONFIG.userAgent,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(SOUNDCLOUD_FETCH_CONFIG.timeoutMs),
    });

    if (!response.ok) {
      return { isPro: null, tier: null, productId: null };
    }

    const data = (await response.json()) as SoundCloudApiUser;
    return detectSoundCloudProFromApiData(data);
  } catch {
    // Network error, timeout, parse error
    return { isPro: null, tier: null, productId: null };
  }
}
