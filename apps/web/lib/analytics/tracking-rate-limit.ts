/**
 * Tracking Rate Limiter
 *
 * Per-creator rate limiting for audience tracking endpoints.
 * Prevents metric spam attacks while allowing legitimate traffic.
 *
 * Default: 10,000 clicks/hour per creator
 * Configurable via environment variables.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';

// Rate limit configuration
const CLICKS_PER_HOUR = parseInt(
  process.env.TRACKING_RATE_LIMIT_CLICKS_PER_HOUR ?? '10000',
  10
);
const VISITS_PER_HOUR = parseInt(
  process.env.TRACKING_RATE_LIMIT_VISITS_PER_HOUR ?? '50000',
  10
);

// Rate limiter for click events - per creator
export const clickRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(CLICKS_PER_HOUR, '1 h'),
      analytics: true,
      prefix: 'tracking:clicks',
    })
  : null;

// Rate limiter for visit events - per creator
export const visitRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(VISITS_PER_HOUR, '1 h'),
      analytics: true,
      prefix: 'tracking:visits',
    })
  : null;

// Additional rate limiter per IP to prevent single-source attacks
const IP_CLICKS_PER_MINUTE = 60;
const IP_VISITS_PER_MINUTE = 120;

export const ipClickRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(IP_CLICKS_PER_MINUTE, '1 m'),
      analytics: true,
      prefix: 'tracking:ip:clicks',
    })
  : null;

export const ipVisitRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(IP_VISITS_PER_MINUTE, '1 m'),
      analytics: true,
      prefix: 'tracking:ip:visits',
    })
  : null;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
  reason?: string;
}

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
  // If Redis is not configured, allow all requests (dev mode)
  if (!clickRateLimiter) {
    console.warn('[Rate Limit] Redis not configured - allowing request');
    return {
      success: true,
      limit: CLICKS_PER_HOUR,
      remaining: CLICKS_PER_HOUR,
      reset: new Date(Date.now() + 3600000),
    };
  }

  try {
    // Check per-creator limit
    const creatorResult = await clickRateLimiter.limit(creatorProfileId);

    if (!creatorResult.success) {
      return {
        success: false,
        limit: creatorResult.limit,
        remaining: creatorResult.remaining,
        reset: new Date(creatorResult.reset),
        reason: 'Creator rate limit exceeded',
      };
    }

    // Check per-IP limit if IP is provided
    if (ipAddress && ipClickRateLimiter) {
      const ipResult = await ipClickRateLimiter.limit(ipAddress);

      if (!ipResult.success) {
        return {
          success: false,
          limit: ipResult.limit,
          remaining: ipResult.remaining,
          reset: new Date(ipResult.reset),
          reason: 'IP rate limit exceeded',
        };
      }
    }

    return {
      success: true,
      limit: creatorResult.limit,
      remaining: creatorResult.remaining,
      reset: new Date(creatorResult.reset),
    };
  } catch (error) {
    console.error('[Rate Limit] Check failed:', error);
    // On error, allow the request but log it
    return {
      success: true,
      limit: CLICKS_PER_HOUR,
      remaining: CLICKS_PER_HOUR,
      reset: new Date(Date.now() + 3600000),
    };
  }
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
  // If Redis is not configured, allow all requests (dev mode)
  if (!visitRateLimiter) {
    console.warn('[Rate Limit] Redis not configured - allowing request');
    return {
      success: true,
      limit: VISITS_PER_HOUR,
      remaining: VISITS_PER_HOUR,
      reset: new Date(Date.now() + 3600000),
    };
  }

  try {
    // Check per-creator limit
    const creatorResult = await visitRateLimiter.limit(creatorProfileId);

    if (!creatorResult.success) {
      return {
        success: false,
        limit: creatorResult.limit,
        remaining: creatorResult.remaining,
        reset: new Date(creatorResult.reset),
        reason: 'Creator rate limit exceeded',
      };
    }

    // Check per-IP limit if IP is provided
    if (ipAddress && ipVisitRateLimiter) {
      const ipResult = await ipVisitRateLimiter.limit(ipAddress);

      if (!ipResult.success) {
        return {
          success: false,
          limit: ipResult.limit,
          remaining: ipResult.remaining,
          reset: new Date(ipResult.reset),
          reason: 'IP rate limit exceeded',
        };
      }
    }

    return {
      success: true,
      limit: creatorResult.limit,
      remaining: creatorResult.remaining,
      reset: new Date(creatorResult.reset),
    };
  } catch (error) {
    console.error('[Rate Limit] Check failed:', error);
    // On error, allow the request but log it
    return {
      success: true,
      limit: VISITS_PER_HOUR,
      remaining: VISITS_PER_HOUR,
      reset: new Date(Date.now() + 3600000),
    };
  }
}

/**
 * Check if rate limiting is enabled
 */
export function isRateLimitingEnabled(): boolean {
  return Boolean(redis);
}

/**
 * Get rate limit headers for HTTP responses
 */
export function getRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.reset.getTime() / 1000)),
  };
}
