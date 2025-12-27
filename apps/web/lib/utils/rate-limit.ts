/**
 * Rate Limiting Utilities
 *
 * This file re-exports from the unified rate limit module for backward compatibility.
 * New code should import directly from '@/lib/rate-limit'.
 *
 * @deprecated Import from '@/lib/rate-limit' instead
 */

import {
  getClientIP as _getClientIP,
  createRateLimitHeadersFromStatus,
  generalLimiter,
  healthLimiter,
  publicClickLimiter,
  publicProfileLimiter,
  publicVisitLimiter,
} from '@/lib/rate-limit';

export type { PublicEndpointType, RateLimitStatus } from '@/lib/rate-limit';

/**
 * @deprecated Use generalLimiter or healthLimiter from '@/lib/rate-limit' instead
 */
export function checkRateLimit(
  identifier: string,
  isHealthEndpoint = false
): boolean {
  const limiter = isHealthEndpoint ? healthLimiter : generalLimiter;
  const status = limiter.getStatus(identifier);

  // Trigger the limit check to increment counter
  void limiter.limit(identifier);

  return status.blocked;
}

/**
 * @deprecated Use limiter.getStatus() from '@/lib/rate-limit' instead
 */
export function getRateLimitStatus(
  identifier: string,
  isHealthEndpoint = false
): {
  limit: number;
  remaining: number;
  resetTime: number;
  blocked: boolean;
} {
  const limiter = isHealthEndpoint ? healthLimiter : generalLimiter;
  const status = limiter.getStatus(identifier);

  return {
    limit: status.limit,
    remaining: status.remaining,
    resetTime: status.resetTime,
    blocked: status.blocked,
  };
}

/**
 * @deprecated Use getClientIP from '@/lib/rate-limit' instead
 */
export function getClientIP(request: Request): string {
  return _getClientIP(request);
}

/**
 * @deprecated Use createRateLimitHeaders from '@/lib/rate-limit' instead
 */
export function createRateLimitHeaders(status: {
  limit: number;
  remaining: number;
  resetTime: number;
}): Record<string, string> {
  return createRateLimitHeadersFromStatus({
    ...status,
    blocked: false,
    retryAfterSeconds: 0,
  });
}

/**
 * @deprecated Use publicProfileLimiter, publicClickLimiter, or publicVisitLimiter from '@/lib/rate-limit' instead
 */
export function checkPublicRateLimit(
  identifier: string,
  endpointType: 'profile' | 'click' | 'visit'
): boolean {
  const limiterMap = {
    profile: publicProfileLimiter,
    click: publicClickLimiter,
    visit: publicVisitLimiter,
  };

  const limiter = limiterMap[endpointType];
  const status = limiter.getStatus(identifier);

  // Trigger the limit check to increment counter
  void limiter.limit(identifier);

  return status.blocked;
}

/**
 * @deprecated Use limiter.getStatus() from '@/lib/rate-limit' instead
 */
export function getPublicRateLimitStatus(
  identifier: string,
  endpointType: 'profile' | 'click' | 'visit'
): {
  limit: number;
  remaining: number;
  resetTime: number;
  blocked: boolean;
  retryAfterSeconds: number;
} {
  const limiterMap = {
    profile: publicProfileLimiter,
    click: publicClickLimiter,
    visit: publicVisitLimiter,
  };

  const limiter = limiterMap[endpointType];
  return limiter.getStatus(identifier);
}
