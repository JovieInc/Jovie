import 'server-only';

import { isYouTubeThumbnailFounderPriceId } from '@/lib/stripe/config';

export const YOUTUBE_THUMBNAIL_FREE_MONTHLY_CANDIDATES = 10;
export const YOUTUBE_THUMBNAIL_FOUNDER_MONTHLY_EXPERIMENT_STARTS = 10;

export type YouTubeThumbnailPlan = 'free' | 'founder';

/**
 * The exact Stripe price, not the broad Jovie plan, grants founder access.
 * This prevents unrelated Pro subscriptions from silently receiving or losing
 * product-specific thumbnail entitlements.
 */
export function resolveYouTubeThumbnailPlan(
  stripePriceId: string | null | undefined
): YouTubeThumbnailPlan {
  return stripePriceId && isYouTubeThumbnailFounderPriceId(stripePriceId)
    ? 'founder'
    : 'free';
}
