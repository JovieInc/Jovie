/**
 * Rate Limiting Utilities
 *
 * This file re-exports from the unified rate limit module for backward compatibility.
 * New code should import directly from '@/lib/rate-limit'.
 *
 * @deprecated Import from '@/lib/rate-limit' instead
 */

import { RATE_LIMIT_CONFIG } from '@/lib/db/config';
import {
  getClientIP as _getClientIP,
  createRateLimitHeadersFromStatus,
  publicClickLimiter,
  publicProfileLimiter,
  publicVisitLimiter,
} from '@/lib/rate-limit';

export type { PublicEndpointType, RateLimitStatus } from '@/lib/rate-limit';

type LegacyRateLimitState = {
  count: number;
  resetTime: number;
};

const legacyRateLimitState = new Map<string, LegacyRateLimitState>();

function getLegacyRateLimitConfig(isHealthEndpoint: boolean): {
  limit: number;
  windowSeconds: number;
} {
  return isHealthEndpoint
    ? {
        limit: RATE_LIMIT_CONFIG.healthRequests,
        windowSeconds: RATE_LIMIT_CONFIG.healthWindow,
      }
    : {
        limit: RATE_LIMIT_CONFIG.requests,
        windowSeconds: RATE_LIMIT_CONFIG.window,
      };
}

function getOrCreateLegacyState(
  identifier: string,
  isHealthEndpoint: boolean
): LegacyRateLimitState {
  const now = Date.now();
  const { windowSeconds } = getLegacyRateLimitConfig(isHealthEndpoint);
  const existing = legacyRateLimitState.get(identifier);

  if (!existing || existing.resetTime <= now) {
    const nextState: LegacyRateLimitState = {
      count: 0,
      resetTime: now + windowSeconds * 1000,
    };
    legacyRateLimitState.set(identifier, nextState);
    return nextState;
  }

  return existing;
}

/**
 * @deprecated Use generalLimiter or healthLimiter from '@/lib/rate-limit' instead
 */
export function checkRateLimit(
  identifier: string,
  isHealthEndpoint = false
): boolean {
  const state = getOrCreateLegacyState(identifier, isHealthEndpoint);
  const { limit } = getLegacyRateLimitConfig(isHealthEndpoint);

  state.count += 1;
  legacyRateLimitState.set(identifier, state);

  return state.count > limit;
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
  const state = getOrCreateLegacyState(identifier, isHealthEndpoint);
  const { limit } = getLegacyRateLimitConfig(isHealthEndpoint);
  const remaining = Math.max(limit - state.count, 0);
  const blocked = state.count > limit;

  return {
    limit,
    remaining,
    resetTime: state.resetTime,
    blocked,
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

  // Account for callers that expect the current attempt to be blocked once the bucket is exhausted.
  return status.blocked || status.remaining <= 0;
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
