/**
 * Tracking Rate Limiter
 *
 * Rate limiting for audience tracking endpoints using the unified rate limit module.
 * Prevents metric spam attacks while allowing legitimate traffic.
 *
 * @deprecated Import from '@/lib/rate-limit' instead for new code
 */

import type { RateLimitResult } from '@/lib/rate-limit';
import {
  checkTrackingRateLimit,
  createRateLimitHeaders,
  RATE_LIMITERS,
  trackingClicksLimiter,
  trackingIpClicksLimiter,
  trackingIpVisitsLimiter,
  trackingVisitsLimiter,
} from '@/lib/rate-limit';

// Re-export the result type for backward compatibility
export type { RateLimitResult } from '@/lib/rate-limit';

// Re-export individual limiters for direct access
export {
  trackingClicksLimiter as clickRateLimiter,
  trackingVisitsLimiter as visitRateLimiter,
  trackingIpClicksLimiter as ipClickRateLimiter,
  trackingIpVisitsLimiter as ipVisitRateLimiter,
};

/**
 * Check rate limit for click events
 *
 * @param creatorProfileId - The creator's profile ID
 * @param ipAddress - The client's IP address (optional)
 * @returns Rate limit result
 */
export async function checkClickRateLimit(
  creatorProfileId: string,
  ipAddress?: string
): Promise<RateLimitResult> {
  return checkTrackingRateLimit('click', creatorProfileId, ipAddress);
}

/**
 * Check rate limit for visit events
 *
 * @param creatorProfileId - The creator's profile ID
 * @param ipAddress - The client's IP address (optional)
 * @returns Rate limit result
 */
export async function checkVisitRateLimit(
  creatorProfileId: string,
  ipAddress?: string
): Promise<RateLimitResult> {
  return checkTrackingRateLimit('visit', creatorProfileId, ipAddress);
}

/**
 * Check if rate limiting is enabled
 */
export { isRateLimitingEnabled } from '@/lib/rate-limit';

/**
 * Get rate limit headers for HTTP responses
 */
export function getRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return createRateLimitHeaders(result);
}

// Export configuration values for reference
export const CLICKS_PER_HOUR = RATE_LIMITERS.trackingClicks.limit;
export const VISITS_PER_HOUR = RATE_LIMITERS.trackingVisits.limit;
export const IP_CLICKS_PER_MINUTE = RATE_LIMITERS.trackingIpClicks.limit;
export const IP_VISITS_PER_MINUTE = RATE_LIMITERS.trackingIpVisits.limit;
