/**
 * Unified Rate Limiting Module
 *
 * A centralized rate limiting system for the Jovie application.
 *
 * Features:
 * - Redis-backed rate limiting with Upstash (production)
 * - In-memory fallback for development/when Redis unavailable
 * - Consistent interface across all rate limiters
 * - Pre-configured limiters for common use cases
 * - Utility functions for IP extraction and header generation
 *
 * Usage:
 * ```typescript
 * import { avatarUploadLimiter, getClientIP, createRateLimitHeaders } from '@/lib/rate-limit';
 *
 * export async function POST(request: Request) {
 *   const ip = getClientIP(request);
 *   const result = await avatarUploadLimiter.limit(userId);
 *
 *   if (!result.success) {
 *     return NextResponse.json(
 *       { error: 'Rate limit exceeded' },
 *       { status: 429, headers: createRateLimitHeaders(result) }
 *     );
 *   }
 *
 *   // Process request...
 * }
 * ```
 */

export type { RateLimiterName } from './config';

// Configuration
export { parseWindowToMs, RATE_LIMITERS } from './config';
// Pre-configured Limiter Instances
export {
  // Admin
  adminImpersonateLimiter,
  // AI Chat
  aiChatLimiter,
  apiLimiter,
  // Auth & User
  avatarUploadLimiter,
  // AI Chat convenience function
  checkAiChatRateLimit,
  checkOnboardingRateLimit,
  // Spotify convenience functions
  checkSpotifyClaimRateLimit,
  checkSpotifyPublicSearchRateLimit,
  checkSpotifyRefreshRateLimit,
  checkSpotifySearchRateLimit,
  // Convenience functions
  checkTrackingRateLimit,
  // Dashboard
  dashboardLinksLimiter,
  generalLimiter,
  getAllLimiters,
  handleCheckLimiter,
  // Health
  healthLimiter,
  // Onboarding
  onboardingLimiter,
  // Payment
  paymentIntentLimiter,
  publicClickLimiter,
  // Public
  publicProfileLimiter,
  publicVisitLimiter,
  // Spotify
  spotifyClaimLimiter,
  spotifyPublicSearchLimiter,
  spotifyRefreshLimiter,
  spotifySearchLimiter,
  // Tracking
  trackingClicksLimiter,
  trackingIpClicksLimiter,
  trackingIpVisitsLimiter,
  trackingVisitsLimiter,
} from './limiters';
export {
  clearStore,
  forceCleanup,
  getStoreSize,
  MemoryRateLimiter,
} from './memory-limiter';
export type { RateLimiterBackend, RateLimiterOptions } from './rate-limiter';
// Rate Limiter Classes
export {
  createRateLimiter,
  isRateLimitingEnabled,
  RateLimiter,
} from './rate-limiter';
export {
  createRedisRateLimiter,
  getRedisClient,
  isRedisAvailable,
} from './redis-limiter';
// Types
export type {
  PublicEndpointType,
  RateLimitConfig,
  RateLimitKeyType,
  RateLimitResult,
  RateLimitStatus,
  TrackingEndpointType,
} from './types';
// Utilities
export {
  createRateLimitHeaders,
  createRateLimitHeadersFromStatus,
  createRateLimitKey,
  formatTimeRemaining,
  getClientIP,
} from './utils';

// ============================================================================
// Backward Compatibility Exports
// ============================================================================

// These exports maintain compatibility with existing code during migration.
// They will be removed in a future version.

import { RATE_LIMITERS } from './config';
import {
  avatarUploadLimiter,
  dashboardLinksLimiter,
  handleCheckLimiter,
  onboardingLimiter,
} from './limiters';
import { createRedisRateLimiter } from './redis-limiter';
import type { RateLimitResult } from './types';

/**
 * @deprecated Use avatarUploadLimiter.limit() instead
 */
export const avatarUploadRateLimit = avatarUploadLimiter.isRedisActive()
  ? createRedisRateLimiter(RATE_LIMITERS.avatarUpload)
  : null;

/**
 * @deprecated Use apiLimiter instead
 */
export const apiRateLimit = createRedisRateLimiter(RATE_LIMITERS.api);

/**
 * @deprecated Use onboardingLimiter.limit() instead
 */
export const onboardingRateLimit = onboardingLimiter.isRedisActive()
  ? createRedisRateLimiter(RATE_LIMITERS.onboarding)
  : null;

/**
 * @deprecated Use handleCheckLimiter.limit() instead
 */
export const handleCheckRateLimit = handleCheckLimiter.isRedisActive()
  ? createRedisRateLimiter(RATE_LIMITERS.handleCheck)
  : null;

/**
 * @deprecated Use dashboardLinksLimiter.limit() instead
 */
export const dashboardLinksRateLimit = dashboardLinksLimiter.isRedisActive()
  ? createRedisRateLimiter(RATE_LIMITERS.dashboardLinks)
  : null;

/**
 * @deprecated Use the specific limiter instances instead
 */
export function createRateLimitHeadersLegacy(
  result: RateLimitResult
): HeadersInit {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.reset.toISOString(),
  };
}
