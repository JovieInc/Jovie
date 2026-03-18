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
  accountDeleteLimiter,
  accountExportLimiter,
  adminCreatorIngestLimiter,
  adminFitScoresLimiter,
  adminImpersonateLimiter,
  aiChatDailyFreeLimiter,
  aiChatDailyGrowthLimiter,
  aiChatDailyPlanAwareLimiter,
  aiChatDailyProLimiter,
  aiChatLimiter,
  apiLimiter,
  appleMusicRescanFreeLimiter,
  appleMusicRescanPaidLimiter,
  appleMusicRescanPlanAwareLimiter,
  appleMusicSearchLimiter,
  artworkUploadLimiter,
  avatarUploadLimiter,
  checkAccountDeleteRateLimit,
  checkAccountExportRateLimit,
  checkAdminCreatorIngestRateLimit,
  checkAdminFitScoresRateLimit,
  checkAdminOutreachRateLimit,
  checkAiChatRateLimit,
  checkAiChatRateLimitForPlan,
  checkAppleMusicRescanRateLimit,
  checkDspDiscoveryRateLimit,
  checkIsrcRescanRateLimit,
  checkOnboardingRateLimit,
  checkReleaseRefreshRateLimit,
  checkSpotifyClaimRateLimit,
  checkSpotifyPublicSearchRateLimit,
  checkSpotifyRefreshRateLimit,
  checkSpotifySearchRateLimit,
  checkTrackingRateLimit,
  checkWrapLinkRateLimit,
  dashboardLinksLimiter,
  dspDiscoveryLimiter,
  generalLimiter,
  getAllLimiters,
  handleCheckLimiter,
  healthLimiter,
  isrcRescanLimiter,
  onboardingLimiter,
  paymentIntentLimiter,
  publicClickLimiter,
  publicProfileLimiter,
  publicVisitLimiter,
  releaseRefreshFreeLimiter,
  releaseRefreshPaidLimiter,
  releaseRefreshPlanAwareLimiter,
  spotifyClaimLimiter,
  spotifyPublicSearchLimiter,
  spotifyRefreshLimiter,
  spotifySearchApiLimiter,
  spotifySearchLimiter,
  trackingClicksLimiter,
  trackingIpClicksLimiter,
  trackingIpVisitsLimiter,
  trackingVisitsLimiter,
  wrapLinkAnonymousLimiter,
  wrapLinkLimiter,
} from './limiters';
export {
  clearStore,
  forceCleanup,
  getStoreSize,
  MemoryRateLimiter,
} from './memory-limiter';
// Plan-Aware Rate Limiter Factory
export { createPlanAwareRateLimiter } from './plan-aware-limiter';
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
  PlanAwareLimiterOptions,
  PlanAwareRateLimiter,
  PlanRateLimitConfig,
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
