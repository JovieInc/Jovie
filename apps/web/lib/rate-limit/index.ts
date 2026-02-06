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
  adminCreatorIngestLimiter,
  adminFitScoresLimiter,
  adminImpersonateLimiter,
  // AI Chat
  aiChatLimiter,
  apiLimiter,
  // Auth & User
  avatarUploadLimiter,
  // AI Chat convenience function
  checkAiChatRateLimit,
  // Admin convenience functions
  checkAdminCreatorIngestRateLimit,
  checkAdminFitScoresRateLimit,
  // DSP convenience functions
  checkDspDiscoveryRateLimit,
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
  // DSP
  dspDiscoveryLimiter,
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
