/**
 * Rate Limiter Instances
 *
 * Pre-configured rate limiter instances for different use cases.
 * Import these directly for the most common rate limiting scenarios.
 */

import { env } from '@/lib/env-server';
import { RATE_LIMITERS } from './config';
import { createPlanAwareRateLimiter } from './plan-aware-limiter';
import { createRateLimiter, RateLimiter } from './rate-limiter';
import type { PlanAwareRateLimiter, RateLimitResult } from './types';

// ============================================================================
// Authentication & User Operations
// ============================================================================

/**
 * Rate limiter for avatar uploads
 * Limit: 3 uploads per minute per user
 */
export const avatarUploadLimiter = createRateLimiter(
  RATE_LIMITERS.avatarUpload
);

/**
 * Rate limiter for artwork uploads
 * Limit: 5 uploads per minute per user
 */
export const artworkUploadLimiter = createRateLimiter(
  RATE_LIMITERS.artworkUpload
);

/**
 * Rate limiter for album art generation.
 * A single generation produces three images, so this is separate from chat quota.
 */
export const albumArtGenerationLimiter = createRateLimiter(
  RATE_LIMITERS.albumArtGeneration,
  { requireRedis: RATE_LIMITERS.albumArtGeneration.requireRedis }
);

/** Burst limiter for rapid repeated album art generations. */
export const albumArtGenerationBurstLimiter = createRateLimiter(
  RATE_LIMITERS.albumArtGenerationBurst,
  { requireRedis: RATE_LIMITERS.albumArtGenerationBurst.requireRedis }
);

/**
 * General API rate limiter
 * Limit: 100 requests per minute per IP
 */
export const apiLimiter = createRateLimiter(RATE_LIMITERS.api);

// ============================================================================
// Onboarding Operations
// ============================================================================

/**
 * Rate limiter for onboarding attempts
 * CRITICAL: 3 attempts per hour per user/IP - prevents handle squatting
 */
export const onboardingLimiter = createRateLimiter(RATE_LIMITERS.onboarding);

/**
 * Rate limiter for handle availability checks
 * Limit: 30 checks per minute per IP - prevents enumeration attacks
 */
export const handleCheckLimiter = createRateLimiter(RATE_LIMITERS.handleCheck);

// ============================================================================
// Dashboard Operations
// ============================================================================

/**
 * Rate limiter for dashboard link operations
 * Limit: 30 requests per minute per user
 */
export const dashboardLinksLimiter = createRateLimiter(
  RATE_LIMITERS.dashboardLinks
);

// ============================================================================
// Payment Operations
// ============================================================================

/**
 * Payment intent creation rate limiter
 * Limit: 10 payment intents per hour per user
 * CRITICAL: Prevents Stripe API abuse and protects against payment intent spam
 */
export const paymentIntentLimiter = createRateLimiter(
  RATE_LIMITERS.paymentIntent
);

/**
 * Tip checkout session rate limiter
 * Limit: 30 sessions per hour per IP
 * Higher than paymentIntent because this is a public endpoint keyed by IP (shared NATs)
 */
export const tipCheckoutLimiter = createRateLimiter(RATE_LIMITERS.tipCheckout);

// ============================================================================
// Admin Operations
// ============================================================================

/**
 * Admin impersonation rate limiter
 * Limit: 5 impersonation attempts per hour per admin
 * CRITICAL: Prevents admin account abuse and brute-force user enumeration
 */
export const adminImpersonateLimiter = createRateLimiter(
  RATE_LIMITERS.adminImpersonate
);

/**
 * Admin fit-score recalculation rate limiter
 * Limit: 5 recalculations per hour per admin
 * Prevents runaway compute from repeated recalculate_all calls
 */
export const adminFitScoresLimiter = createRateLimiter(
  RATE_LIMITERS.adminFitScores
);

/**
 * Admin creator ingest rate limiter
 * Limit: 10 ingestions per minute per admin
 * Prevents excessive external API calls from rapid ingestion
 */
export const adminCreatorIngestLimiter = createRateLimiter(
  RATE_LIMITERS.adminCreatorIngest
);

/**
 * Deploy promote rate limiter
 * Limit: 1 request per minute globally
 */
export const deployPromoteLimiter = createRateLimiter(
  RATE_LIMITERS.deployPromote,
  {
    requireRedis: true,
  }
);

/**
 * Admin outreach rate limiter
 * Limit: 10 per hour per admin
 * Prevents excessive bulk external API calls via Instantly
 */
export const adminOutreachLimiter = createRateLimiter(
  RATE_LIMITERS.adminOutreach
);

// ============================================================================
// Tracking & Analytics
// ============================================================================

/**
 * Rate limiter for click tracking (per creator)
 * Limit: 10,000 clicks per hour (configurable via env)
 */
export const trackingClicksLimiter = createRateLimiter(
  RATE_LIMITERS.trackingClicks
);

/**
 * Rate limiter for visit tracking (per creator)
 * Limit: 50,000 visits per hour (configurable via env)
 */
export const trackingVisitsLimiter = createRateLimiter(
  RATE_LIMITERS.trackingVisits
);

/**
 * Rate limiter for click tracking (per IP)
 * Limit: 60 clicks per minute - prevents single-source attacks
 */
export const trackingIpClicksLimiter = createRateLimiter(
  RATE_LIMITERS.trackingIpClicks
);

/**
 * Rate limiter for visit tracking (per IP)
 * Limit: 120 visits per minute - prevents single-source attacks
 */
export const trackingIpVisitsLimiter = createRateLimiter(
  RATE_LIMITERS.trackingIpVisits
);

// ============================================================================
// Public & Health Endpoints (Durable Redis-backed enforcement)
// ============================================================================

/**
 * Rate limiter for public profile requests
 * Limit: 100 requests per minute per IP
 */
export const publicProfileLimiter = createRateLimiter(
  RATE_LIMITERS.publicProfile,
  {
    requireRedis: true,
  }
);

/**
 * Rate limiter for public click endpoint
 * Limit: 50 requests per minute per IP
 */
export const publicClickLimiter = createRateLimiter(RATE_LIMITERS.publicClick, {
  requireRedis: true,
});

/**
 * Rate limiter for public visit endpoint
 * Limit: 50 requests per minute per IP
 */
export const publicVisitLimiter = createRateLimiter(RATE_LIMITERS.publicVisit, {
  requireRedis: true,
});

/**
 * Rate limiter for health endpoints
 * Limit: 30 requests per minute per IP
 */
export const healthLimiter = createRateLimiter(RATE_LIMITERS.health, {
  requireRedis: true,
});

/**
 * General purpose rate limiter
 * Limit: 60 requests per minute per IP
 */
export const generalLimiter = createRateLimiter(RATE_LIMITERS.general, {
  requireRedis: true,
});

/**
 * Changelog subscribe limiter
 * Limit: 1 request per 10 seconds per IP
 */
export const changelogSubscribeLimiter = createRateLimiter(
  RATE_LIMITERS.changelogSubscribe,
  {
    requireRedis: true,
  }
);

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check tracking rate limits (both creator and IP)
 * Returns the first failure or success if all pass
 */
export async function checkTrackingRateLimit(
  type: 'click' | 'visit',
  creatorProfileId: string,
  ipAddress?: string
): Promise<RateLimitResult> {
  const creatorLimiter =
    type === 'click' ? trackingClicksLimiter : trackingVisitsLimiter;
  const ipLimiter =
    type === 'click' ? trackingIpClicksLimiter : trackingIpVisitsLimiter;

  // Check creator limit first
  const creatorResult = await creatorLimiter.limit(creatorProfileId);
  if (!creatorResult.success) {
    return {
      ...creatorResult,
      reason: 'Creator rate limit exceeded',
    };
  }

  // Check IP limit if provided
  if (ipAddress) {
    const ipResult = await ipLimiter.limit(ipAddress);
    if (!ipResult.success) {
      return {
        ...ipResult,
        reason: 'IP rate limit exceeded',
      };
    }
  }

  return creatorResult;
}

/**
 * Check onboarding rate limits (both user and IP)
 * Returns the first failure or success if all pass
 */
export async function checkOnboardingRateLimit(
  userId: string,
  ipAddress: string,
  checkIP = true
): Promise<RateLimitResult> {
  // Check user limit
  const userResult = await onboardingLimiter.limit(`user:${userId}`);
  if (!userResult.success) {
    return {
      ...userResult,
      reason: 'Too many onboarding attempts. Please try again later.',
    };
  }

  // Check IP limit if enabled
  if (checkIP) {
    const ipResult = await onboardingLimiter.limit(`ip:${ipAddress}`);
    if (!ipResult.success) {
      return {
        ...ipResult,
        reason: 'Too many onboarding attempts from this network.',
      };
    }
  }

  return userResult;
}

// ============================================================================
// Spotify Ingest Operations
// ============================================================================

/**
 * Rate limiter for Spotify artist search
 * Limit: 30 requests per minute per user
 */
export const spotifySearchLimiter = createRateLimiter(
  RATE_LIMITERS.spotifySearch
);

/**
 * Rate limiter for Spotify search API
 * Limit: 30 requests per minute per IP
 */
export const spotifySearchApiLimiter = createRateLimiter(
  RATE_LIMITERS.spotifySearchApi
);

/**
 * Rate limiter for profile claim attempts
 * CRITICAL: 5 attempts per hour per user - prevents claim abuse
 */
export const spotifyClaimLimiter = createRateLimiter(
  RATE_LIMITERS.spotifyClaim
);

/**
 * Rate limiter for artist data refresh
 * Limit: 10 per hour per artist
 */
export const spotifyRefreshLimiter = createRateLimiter(
  RATE_LIMITERS.spotifyRefresh
);

/**
 * Rate limiter for unauthenticated search (homepage)
 * Limit: 10 per minute per IP (in-memory for high throughput)
 */
export const spotifyPublicSearchLimiter = createRateLimiter(
  RATE_LIMITERS.spotifyPublicSearch,
  { preferRedis: false }
);

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generic rate limit checker with custom error message.
 * Eliminates duplication across single-limiter check functions.
 */
async function checkRateLimit(
  limiter: RateLimiter,
  key: string,
  errorMessage: string
): Promise<RateLimitResult> {
  const result = await limiter.limit(key);
  if (!result.success) {
    return {
      ...result,
      reason: errorMessage,
    };
  }
  return result;
}

/**
 * Check Spotify search rate limits (authenticated user)
 * Returns the first failure or success if all pass
 */
export async function checkSpotifySearchRateLimit(
  userId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    spotifySearchLimiter,
    userId,
    'Search rate limit exceeded. Please wait before searching again.'
  );
}

/**
 * Check Spotify public search rate limits (by IP)
 * Returns the first failure or success if all pass
 */
export async function checkSpotifyPublicSearchRateLimit(
  ipAddress: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    spotifyPublicSearchLimiter,
    ipAddress,
    'Too many search requests. Please wait before trying again.'
  );
}

/**
 * Check profile claim rate limit
 * Returns the first failure or success if pass
 */
export async function checkSpotifyClaimRateLimit(
  userId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    spotifyClaimLimiter,
    userId,
    'Too many claim attempts. Please try again later.'
  );
}

/**
 * Check artist data refresh rate limit
 * Returns the first failure or success if pass
 */
export async function checkSpotifyRefreshRateLimit(
  artistId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    spotifyRefreshLimiter,
    artistId,
    'Artist data was recently refreshed. Please wait before refreshing again.'
  );
}

// ============================================================================
// AI Chat Operations
// ============================================================================

/**
 * Rate limiter for AI chat messages (burst protection)
 * Limit: 30 messages per hour per user - protects Anthropic API costs
 */
export const aiChatLimiter = createRateLimiter(RATE_LIMITERS.aiChat);

/**
 * Plan-specific daily AI chat limiters.
 * Each plan has a separate daily quota on top of the hourly burst limiter.
 *
 * @deprecated Use aiChatDailyPlanAwareLimiter instead for new code.
 * These individual limiters are kept for backward compatibility.
 */
export const aiChatDailyFreeLimiter = createRateLimiter(
  RATE_LIMITERS.aiChatDailyFree
);
export const aiChatDailyProLimiter = createRateLimiter(
  RATE_LIMITERS.aiChatDailyPro
);
export const aiChatDailyMaxLimiter = createRateLimiter(
  RATE_LIMITERS.aiChatDailyMax
);

/**
 * Plan-aware AI chat daily limiter.
 * Automatically selects the correct daily quota based on the user's plan tier.
 * - Free: 10 messages/day
 * - Pro: 100 messages/day
 * - Max: 500 messages/day
 */
export const aiChatDailyPlanAwareLimiter: PlanAwareRateLimiter =
  createPlanAwareRateLimiter({
    configs: {
      free: RATE_LIMITERS.aiChatDailyFree,
      pro: RATE_LIMITERS.aiChatDailyPro,
      // founding falls back to pro automatically via the factory
      max: RATE_LIMITERS.aiChatDailyMax,
    },
    errorMessage: plan =>
      plan === 'max' || plan === 'pro'
        ? 'You have reached your daily AI message limit. Your quota resets tomorrow.'
        : 'You have reached your daily AI message limit. Upgrade to Pro for 100 messages per day.',
  });

/**
 * Check AI chat rate limit (burst only, plan-unaware).
 * Kept for backward compatibility. Prefer checkAiChatRateLimitForPlan.
 */
export async function checkAiChatRateLimit(
  userId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    aiChatLimiter,
    userId,
    'You have reached the chat limit. Please try again later.'
  );
}

/**
 * Check AI chat rate limits for a specific plan.
 * Applies both the hourly burst limiter (all plans) and the daily plan quota.
 * Returns the first failure or success if all pass.
 */
export async function checkAiChatRateLimitForPlan(
  userId: string,
  plan: string | null
): Promise<RateLimitResult> {
  // 1. Check hourly burst limiter (applies to all plans)
  const burstResult = await checkRateLimit(
    aiChatLimiter,
    userId,
    'Too many messages in a short time. Please wait a moment.'
  );
  if (!burstResult.success) {
    return burstResult;
  }

  // 2. Check daily plan-specific quota using the plan-aware limiter
  const dailyResult = await aiChatDailyPlanAwareLimiter.limit(userId, plan);
  return dailyResult;
}

// ============================================================================
// Tour Date Operations
// ============================================================================

/**
 * Rate limiter for Bandsintown sync
 * Limit: 1 sync per 5 minutes per profile - conservative for external API
 */
export const bandsintownSyncLimiter = createRateLimiter(
  RATE_LIMITERS.bandsintownSync
);

/**
 * Check Bandsintown sync rate limit
 * Returns the first failure or success if pass
 */
export async function checkBandsintownSyncRateLimit(
  profileId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    bandsintownSyncLimiter,
    profileId,
    'Tour dates were recently synced. Please wait 5 minutes before syncing again.'
  );
}

// ============================================================================
// DSP Discovery Operations
// ============================================================================

/**
 * Rate limiter for Apple Music search
 * Limit: 30 requests per minute per IP
 */
export const appleMusicSearchLimiter = createRateLimiter(
  RATE_LIMITERS.appleMusicSearch
);

/**
 * Rate limiter for MusicBrainz lookups.
 * Limit: 1 request per second across the configured backend.
 */
export const musicBrainzLookupLimiter = createRateLimiter(
  RATE_LIMITERS.musicBrainzLookup,
  {
    // Intentionally fail closed in production so a Redis outage doesn't
    // degrade into unsynchronized per-instance bursting against MusicBrainz.
    requireRedis: env.NODE_ENV === 'production',
  }
);

/**
 * Rate limiter for DSP artist discovery
 * Limit: 10 discoveries per minute per user
 * Protects 3rd-party platform APIs (Apple Music, Deezer, MusicBrainz)
 */
export const dspDiscoveryLimiter = createRateLimiter(
  RATE_LIMITERS.dspDiscovery
);

/**
 * Check DSP discovery rate limit
 * Returns the first failure or success if pass
 */
export async function checkDspDiscoveryRateLimit(
  userId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    dspDiscoveryLimiter,
    userId,
    'Discovery rate limit exceeded. Please wait before triggering another discovery.'
  );
}

/**
 * Rate limiter for ISRC rescan
 * Limit: 1 rescan per 5 minutes per release - prevents API abuse
 */
export const isrcRescanLimiter = createRateLimiter(RATE_LIMITERS.isrcRescan);

/**
 * Check ISRC rescan rate limit
 * Returns the first failure or success if pass
 */
export async function checkIsrcRescanRateLimit(
  releaseId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    isrcRescanLimiter,
    releaseId,
    'This release was recently scanned. Please wait before scanning again.'
  );
}

// ============================================================================
// Apple Music Rescan (plan-aware)
// ============================================================================

// Internal instances (used in getAllLimiters without triggering deprecated-symbol warnings)
const _appleMusicRescanFreeLimiter = createRateLimiter(
  RATE_LIMITERS.appleMusicRescanFree
);
const _appleMusicRescanPaidLimiter = createRateLimiter(
  RATE_LIMITERS.appleMusicRescanPaid
);

/**
 * Rate limiter for Apple Music rescan (free plan)
 * Limit: 1 per day per profile
 *
 * @deprecated Use appleMusicRescanPlanAwareLimiter instead for new code.
 * This individual limiter is kept for backward compatibility.
 */
export const appleMusicRescanFreeLimiter = _appleMusicRescanFreeLimiter;

/**
 * Rate limiter for Apple Music rescan (paid plan)
 * Limit: 1 per hour per profile
 *
 * @deprecated Use appleMusicRescanPlanAwareLimiter instead for new code.
 * This individual limiter is kept for backward compatibility.
 */
export const appleMusicRescanPaidLimiter = _appleMusicRescanPaidLimiter;

/**
 * Plan-aware Apple Music rescan limiter.
 * Automatically selects the correct limit based on the user's plan tier.
 * - Free: 1 per day
 * - Pro/Max: 1 per hour
 */
export const appleMusicRescanPlanAwareLimiter: PlanAwareRateLimiter =
  createPlanAwareRateLimiter({
    configs: {
      free: RATE_LIMITERS.appleMusicRescanFree,
      pro: RATE_LIMITERS.appleMusicRescanPaid,
      // founding falls back to pro automatically via the factory
      max: RATE_LIMITERS.appleMusicRescanPaid,
    },
    errorMessage: plan =>
      plan === 'max' || plan === 'pro'
        ? 'Apple Music was recently refreshed. Please wait 1 hour before refreshing again.'
        : 'Apple Music was recently refreshed. Please wait 24 hours before refreshing again. Upgrade to Pro for hourly refreshes.',
  });

/**
 * Check Apple Music rescan rate limit (plan-aware).
 * Free: 1/day, Paid (pro/max): 1/hour.
 */
export async function checkAppleMusicRescanRateLimit(
  profileId: string,
  plan: string | null
): Promise<RateLimitResult> {
  return appleMusicRescanPlanAwareLimiter.limit(profileId, plan);
}

// ============================================================================
// Release Refresh (plan-aware)
// ============================================================================

// Internal instances (used in getAllLimiters without triggering deprecated-symbol warnings)
const _releaseRefreshFreeLimiter = createRateLimiter(
  RATE_LIMITERS.releaseRefreshFree
);
const _releaseRefreshPaidLimiter = createRateLimiter(
  RATE_LIMITERS.releaseRefreshPaid
);

/**
 * Rate limiter for release refresh (free plan)
 * Limit: 1 per day per release
 *
 * @deprecated Use releaseRefreshPlanAwareLimiter instead for new code.
 * This individual limiter is kept for backward compatibility.
 */
export const releaseRefreshFreeLimiter = _releaseRefreshFreeLimiter;

/**
 * Rate limiter for release refresh (paid plan)
 * Limit: 1 per hour per release
 *
 * @deprecated Use releaseRefreshPlanAwareLimiter instead for new code.
 * This individual limiter is kept for backward compatibility.
 */
export const releaseRefreshPaidLimiter = _releaseRefreshPaidLimiter;

/**
 * Plan-aware release refresh limiter.
 * Automatically selects the correct limit based on the user's plan tier.
 * - Free: 1 per day
 * - Pro/Max: 1 per hour
 */
export const releaseRefreshPlanAwareLimiter: PlanAwareRateLimiter =
  createPlanAwareRateLimiter({
    configs: {
      free: RATE_LIMITERS.releaseRefreshFree,
      pro: RATE_LIMITERS.releaseRefreshPaid,
      // founding falls back to pro automatically via the factory
      max: RATE_LIMITERS.releaseRefreshPaid,
    },
    errorMessage: plan =>
      plan === 'max' || plan === 'pro'
        ? 'This release was recently refreshed. Please wait 1 hour before refreshing again.'
        : 'This release was recently refreshed. Please wait 24 hours before refreshing again. Upgrade to Pro for hourly refreshes.',
  });

/**
 * Check release refresh rate limit (plan-aware).
 * Free: 1/day, Paid (pro/max): 1/hour.
 */
export async function checkReleaseRefreshRateLimit(
  releaseId: string,
  plan: string | null
): Promise<RateLimitResult> {
  return releaseRefreshPlanAwareLimiter.limit(releaseId, plan);
}

/**
 * Check admin fit-scores rate limit
 * Returns the first failure or success if pass
 */
export async function checkAdminFitScoresRateLimit(
  adminUserId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    adminFitScoresLimiter,
    adminUserId,
    'Fit score recalculation rate limit exceeded. Please wait before trying again.'
  );
}

/**
 * Check admin creator ingest rate limit
 * Returns the first failure or success if pass
 */
export async function checkAdminCreatorIngestRateLimit(
  adminUserId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    adminCreatorIngestLimiter,
    adminUserId,
    'Creator ingest rate limit exceeded. Please wait before ingesting another profile.'
  );
}

/**
 * Check admin outreach rate limit
 * Returns the first failure or success if pass
 */
export async function checkAdminOutreachRateLimit(
  adminUserId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    adminOutreachLimiter,
    adminUserId,
    'Outreach rate limit exceeded. Please wait before sending another batch.'
  );
}

// ============================================================================
// Account Operations (GDPR)
// ============================================================================

/**
 * Rate limiter for account deletion
 * CRITICAL: 3 attempts per day per user - destructive operation
 */
export const accountDeleteLimiter = createRateLimiter(
  RATE_LIMITERS.accountDelete
);

/**
 * Rate limiter for account data export
 * Limit: 5 exports per hour per user - protects against abuse
 */
export const accountExportLimiter = createRateLimiter(
  RATE_LIMITERS.accountExport
);

/**
 * Check account deletion rate limit
 * Returns the first failure or success if pass
 */
export async function checkAccountDeleteRateLimit(
  userId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    accountDeleteLimiter,
    userId,
    'Too many deletion attempts. Please try again later.'
  );
}

/**
 * Check account export rate limit
 * Returns the first failure or success if pass
 */
export async function checkAccountExportRateLimit(
  userId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    accountExportLimiter,
    userId,
    'Too many export requests. Please try again later.'
  );
}

// ============================================================================
// Verification Operations
// ============================================================================

/**
 * Rate limiter for profile verification requests
 * Limit: 3 requests per day per user
 * CRITICAL: each request fans out to a Slack webhook; without this a single
 * authenticated Pro user can spam the internal #verification channel.
 */
export const verificationRequestLimiter = createRateLimiter(
  RATE_LIMITERS.verificationRequest
);

/**
 * Check verification request rate limit.
 * Returns success or the first failure with a caller-ready reason.
 */
export async function checkVerificationRequestRateLimit(
  userId: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    verificationRequestLimiter,
    userId,
    'You have submitted too many verification requests. Please try again later.'
  );
}

// ============================================================================
// Link Wrapping
// ============================================================================

/**
 * Rate limiter for wrap-link (authenticated)
 * Limit: 50 requests per hour per user
 */
export const wrapLinkLimiter = createRateLimiter(RATE_LIMITERS.wrapLink);

/**
 * Rate limiter for wrap-link (anonymous)
 * Limit: 20 requests per hour per IP - stricter for unauthenticated callers
 */
export const wrapLinkAnonymousLimiter = createRateLimiter(
  RATE_LIMITERS.wrapLinkAnonymous
);

/**
 * Check wrap-link rate limit.
 * Uses userId for authenticated callers, IP for anonymous.
 */
export async function checkWrapLinkRateLimit(
  identifier: string,
  isAuthenticated: boolean
): Promise<RateLimitResult> {
  const limiter = isAuthenticated ? wrapLinkLimiter : wrapLinkAnonymousLimiter;
  const result = await limiter.limit(identifier);
  if (!result.success) {
    return {
      ...result,
      reason: 'Rate limit exceeded. Please try again later.',
    };
  }
  return result;
}

/**
 * Get a map of all limiters for monitoring/debugging
 */
export function getAllLimiters(): Record<string, RateLimiter> {
  return {
    avatarUpload: avatarUploadLimiter,
    artworkUpload: artworkUploadLimiter,
    albumArtGeneration: albumArtGenerationLimiter,
    albumArtGenerationBurst: albumArtGenerationBurstLimiter,
    api: apiLimiter,
    onboarding: onboardingLimiter,
    handleCheck: handleCheckLimiter,
    dashboardLinks: dashboardLinksLimiter,
    paymentIntent: paymentIntentLimiter,
    tipCheckout: tipCheckoutLimiter,
    adminImpersonate: adminImpersonateLimiter,
    adminFitScores: adminFitScoresLimiter,
    adminCreatorIngest: adminCreatorIngestLimiter,
    adminOutreach: adminOutreachLimiter,
    deployPromote: deployPromoteLimiter,
    dspDiscovery: dspDiscoveryLimiter,
    isrcRescan: isrcRescanLimiter,
    trackingClicks: trackingClicksLimiter,
    trackingVisits: trackingVisitsLimiter,
    trackingIpClicks: trackingIpClicksLimiter,
    trackingIpVisits: trackingIpVisitsLimiter,
    publicProfile: publicProfileLimiter,
    publicClick: publicClickLimiter,
    publicVisit: publicVisitLimiter,
    health: healthLimiter,
    general: generalLimiter,
    changelogSubscribe: changelogSubscribeLimiter,
    spotifySearch: spotifySearchLimiter,
    spotifySearchApi: spotifySearchApiLimiter,
    spotifyClaim: spotifyClaimLimiter,
    spotifyRefresh: spotifyRefreshLimiter,
    spotifyPublicSearch: spotifyPublicSearchLimiter,
    aiChat: aiChatLimiter,
    bandsintownSync: bandsintownSyncLimiter,
    appleMusicSearch: appleMusicSearchLimiter,
    musicBrainzLookup: musicBrainzLookupLimiter,
    appleMusicRescanFree: _appleMusicRescanFreeLimiter,
    appleMusicRescanPaid: _appleMusicRescanPaidLimiter,
    releaseRefreshFree: _releaseRefreshFreeLimiter,
    releaseRefreshPaid: _releaseRefreshPaidLimiter,
    accountDelete: accountDeleteLimiter,
    accountExport: accountExportLimiter,
    wrapLink: wrapLinkLimiter,
    wrapLinkAnonymous: wrapLinkAnonymousLimiter,
    verificationRequest: verificationRequestLimiter,
  };
}
