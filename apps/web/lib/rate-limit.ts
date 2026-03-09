/**
 * Unified Rate Limiting Module
 *
 * This is the main entry point for rate limiting in the application.
 * All rate limiting functionality is centralized in the rate-limit/ directory.
 *
 * Usage:
 * ```typescript
 * import {
 *   avatarUploadLimiter,
 *   getClientIP,
 *   createRateLimitHeaders
 * } from '@/lib/rate-limit';
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
 * }
 * ```
 */

export type { RateLimiterName } from './rate-limit/config';

export { parseWindowToMs, RATE_LIMITERS } from './rate-limit/config';

export {
  accountDeleteLimiter,
  accountExportLimiter,
  adminCreatorIngestLimiter,
  adminFitScoresLimiter,
  adminImpersonateLimiter,
  aiChatDailyFreeLimiter,
  aiChatDailyGrowthLimiter,
  aiChatDailyProLimiter,
  aiChatLimiter,
  apiLimiter,
  appleMusicRescanFreeLimiter,
  appleMusicRescanPaidLimiter,
  appleMusicSearchLimiter,
  artworkUploadLimiter,
  avatarUploadLimiter,
  checkAccountDeleteRateLimit,
  checkAccountExportRateLimit,
  checkAdminCreatorIngestRateLimit,
  checkAdminFitScoresRateLimit,
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
} from './rate-limit/limiters';

export {
  clearStore,
  forceCleanup,
  getStoreSize,
  MemoryRateLimiter,
} from './rate-limit/memory-limiter';

export type {
  RateLimiterBackend,
  RateLimiterOptions,
} from './rate-limit/rate-limiter';
export {
  createRateLimiter,
  isRateLimitingEnabled,
  RateLimiter,
} from './rate-limit/rate-limiter';

export {
  createRedisRateLimiter,
  getRedisClient,
  isRedisAvailable,
} from './rate-limit/redis-limiter';

export type {
  PublicEndpointType,
  RateLimitConfig,
  RateLimitKeyType,
  RateLimitResult,
  RateLimitStatus,
  TrackingEndpointType,
} from './rate-limit/types';

export {
  createRateLimitHeaders,
  createRateLimitHeadersFromStatus,
  createRateLimitKey,
  formatTimeRemaining,
  getClientIP,
} from './rate-limit/utils';
