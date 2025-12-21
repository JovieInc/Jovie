/**
 * Simple in-memory rate limiter for health and public endpoints
 * Note: This is not persistent across server restarts and doesn't scale across multiple instances.
 * For production use, consider implementing with Redis/Upstash.
 */

import { PUBLIC_RATE_LIMIT_CONFIG, RATE_LIMIT_CONFIG } from '@/lib/db/config';

export type PublicEndpointType = 'profile' | 'click' | 'visit';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage for rate limiting (per-process)
// Note: This will be reset on server restart
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if a request should be rate limited
 * @param identifier - Usually IP address, but could be user ID for authenticated endpoints
 * @param isHealthEndpoint - Whether this is a health endpoint (stricter limits)
 * @returns true if rate limited, false if allowed
 */
export function checkRateLimit(
  identifier: string,
  isHealthEndpoint = false
): boolean {
  const now = Date.now();
  const config = isHealthEndpoint
    ? {
        requests: RATE_LIMIT_CONFIG.healthRequests,
        windowMs: RATE_LIMIT_CONFIG.healthWindow * 1000,
      }
    : {
        requests: RATE_LIMIT_CONFIG.requests,
        windowMs: RATE_LIMIT_CONFIG.window * 1000,
      };

  const key = `${identifier}:${isHealthEndpoint ? 'health' : 'general'}`;
  const existing = rateLimitStore.get(key);

  // Clean up expired entries periodically (simple cleanup)
  if (Math.random() < 0.1) {
    // 10% chance to clean up on each request
    cleanupExpiredEntries();
  }

  if (!existing || now > existing.resetTime) {
    // First request or window has expired
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return false; // Not rate limited
  }

  if (existing.count >= config.requests) {
    // Rate limit exceeded
    return true;
  }

  // Increment counter
  rateLimitStore.set(key, {
    ...existing,
    count: existing.count + 1,
  });

  return false; // Not rate limited
}

/**
 * Get rate limit status for an identifier
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
  const now = Date.now();
  const config = isHealthEndpoint
    ? {
        requests: RATE_LIMIT_CONFIG.healthRequests,
        windowMs: RATE_LIMIT_CONFIG.healthWindow * 1000,
      }
    : {
        requests: RATE_LIMIT_CONFIG.requests,
        windowMs: RATE_LIMIT_CONFIG.window * 1000,
      };

  const key = `${identifier}:${isHealthEndpoint ? 'health' : 'general'}`;
  const existing = rateLimitStore.get(key);

  if (!existing || now > existing.resetTime) {
    return {
      limit: config.requests,
      remaining: config.requests - 1,
      resetTime: now + config.windowMs,
      blocked: false,
    };
  }

  const remaining = Math.max(0, config.requests - existing.count);
  const blocked = existing.count >= config.requests;

  return {
    limit: config.requests,
    remaining,
    resetTime: existing.resetTime,
    blocked,
  };
}

/**
 * Clean up expired rate limit entries to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }
}

/**
 * Get the client IP address from the request
 */
export function getClientIP(request: Request): string {
  // Try various headers in order of preference
  const headers = {
    'x-forwarded-for': request.headers.get('x-forwarded-for'),
    'x-real-ip': request.headers.get('x-real-ip'),
    'x-client-ip': request.headers.get('x-client-ip'),
    'cf-connecting-ip': request.headers.get('cf-connecting-ip'), // Cloudflare
    'true-client-ip': request.headers.get('true-client-ip'), // Cloudflare Enterprise
  };

  // x-forwarded-for can contain multiple IPs, take the first one
  const xForwardedFor = headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }

  // Try other headers
  for (const header of Object.values(headers)) {
    if (header) {
      return header;
    }
  }

  // Fallback to localhost for development
  return '127.0.0.1';
}

/**
 * Create standardized rate limit response headers
 */
export function createRateLimitHeaders(status: {
  limit: number;
  remaining: number;
  resetTime: number;
}): Record<string, string> {
  return {
    'X-RateLimit-Limit': status.limit.toString(),
    'X-RateLimit-Remaining': status.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(status.resetTime / 1000).toString(),
    'Retry-After': Math.ceil((status.resetTime - Date.now()) / 1000).toString(),
  };
}

/**
 * Check if a request to a public endpoint should be rate limited
 * @param identifier - Usually IP address
 * @param endpointType - Type of public endpoint (profile, click, visit)
 * @returns true if rate limited, false if allowed
 */
export function checkPublicRateLimit(
  identifier: string,
  endpointType: PublicEndpointType
): boolean {
  const now = Date.now();
  const config = PUBLIC_RATE_LIMIT_CONFIG[endpointType];
  const windowMs = config.windowSeconds * 1000;

  const key = `${identifier}:public:${endpointType}`;
  const existing = rateLimitStore.get(key);

  // Clean up expired entries periodically (simple cleanup)
  if (Math.random() < 0.1) {
    cleanupExpiredEntries();
  }

  if (!existing || now > existing.resetTime) {
    // First request or window has expired
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return false; // Not rate limited
  }

  if (existing.count >= config.requests) {
    // Rate limit exceeded
    return true;
  }

  // Increment counter
  rateLimitStore.set(key, {
    ...existing,
    count: existing.count + 1,
  });

  return false; // Not rate limited
}

/**
 * Get rate limit status for a public endpoint
 */
export function getPublicRateLimitStatus(
  identifier: string,
  endpointType: PublicEndpointType
): {
  limit: number;
  remaining: number;
  resetTime: number;
  blocked: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const config = PUBLIC_RATE_LIMIT_CONFIG[endpointType];
  const windowMs = config.windowSeconds * 1000;

  const key = `${identifier}:public:${endpointType}`;
  const existing = rateLimitStore.get(key);

  if (!existing || now > existing.resetTime) {
    return {
      limit: config.requests,
      remaining: config.requests,
      resetTime: now + windowMs,
      blocked: false,
      retryAfterSeconds: 0,
    };
  }

  const remaining = Math.max(0, config.requests - existing.count);
  const blocked = existing.count >= config.requests;
  const retryAfterSeconds = blocked
    ? Math.ceil((existing.resetTime - now) / 1000)
    : 0;

  return {
    limit: config.requests,
    remaining,
    resetTime: existing.resetTime,
    blocked,
    retryAfterSeconds,
  };
}
