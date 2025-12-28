/**
 * Rate Limiter Instances
 *
 * Pre-configured rate limiter instances for different use cases.
 * Import these directly for the most common rate limiting scenarios.
 */

import { RATE_LIMITERS } from './config';
import { createRateLimiter, RateLimiter } from './rate-limiter';
import type { RateLimitResult } from './types';

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
// Public & Health Endpoints (Memory-only for high throughput)
// ============================================================================

/**
 * Rate limiter for public profile requests
 * Limit: 100 requests per minute per IP (in-memory only)
 */
export const publicProfileLimiter = createRateLimiter(
  RATE_LIMITERS.publicProfile,
  {
    preferRedis: false, // Use memory for high-throughput public endpoints
  }
);

/**
 * Rate limiter for public click endpoint
 * Limit: 50 requests per minute per IP (in-memory only)
 */
export const publicClickLimiter = createRateLimiter(RATE_LIMITERS.publicClick, {
  preferRedis: false,
});

/**
 * Rate limiter for public visit endpoint
 * Limit: 50 requests per minute per IP (in-memory only)
 */
export const publicVisitLimiter = createRateLimiter(RATE_LIMITERS.publicVisit, {
  preferRedis: false,
});

/**
 * Rate limiter for health endpoints
 * Limit: 30 requests per minute per IP (in-memory only)
 */
export const healthLimiter = createRateLimiter(RATE_LIMITERS.health, {
  preferRedis: false,
});

/**
 * General purpose rate limiter
 * Limit: 60 requests per minute per IP (in-memory only)
 */
export const generalLimiter = createRateLimiter(RATE_LIMITERS.general, {
  preferRedis: false,
});

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
// Payment Operations (CRITICAL - protect against abuse)
// ============================================================================

/**
 * Rate limiter for Stripe checkout sessions
 * Limit: 5 checkouts per minute per user - prevents payment abuse
 */
export const stripeCheckoutLimiter = createRateLimiter(
  RATE_LIMITERS.stripeCheckout
);

/**
 * Rate limiter for Stripe billing portal sessions
 * Limit: 10 portal sessions per minute per user
 */
export const stripePortalLimiter = createRateLimiter(
  RATE_LIMITERS.stripePortal
);

/**
 * Rate limiter for tip payment intents
 * Limit: 10 tip intents per minute per IP - public endpoint protection
 */
export const tipIntentLimiter = createRateLimiter(RATE_LIMITERS.tipIntent);

/**
 * Rate limiter for link wrapping
 * Limit: 30 links per hour per IP
 */
export const linkWrapLimiter = createRateLimiter(RATE_LIMITERS.linkWrap);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a map of all limiters for monitoring/debugging
 */
export function getAllLimiters(): Record<string, RateLimiter> {
  return {
    avatarUpload: avatarUploadLimiter,
    api: apiLimiter,
    onboarding: onboardingLimiter,
    handleCheck: handleCheckLimiter,
    dashboardLinks: dashboardLinksLimiter,
    trackingClicks: trackingClicksLimiter,
    trackingVisits: trackingVisitsLimiter,
    trackingIpClicks: trackingIpClicksLimiter,
    trackingIpVisits: trackingIpVisitsLimiter,
    publicProfile: publicProfileLimiter,
    publicClick: publicClickLimiter,
    publicVisit: publicVisitLimiter,
    health: healthLimiter,
    general: generalLimiter,
    stripeCheckout: stripeCheckoutLimiter,
    stripePortal: stripePortalLimiter,
    tipIntent: tipIntentLimiter,
    linkWrap: linkWrapLimiter,
  };
}
