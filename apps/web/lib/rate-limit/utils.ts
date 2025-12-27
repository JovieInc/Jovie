/**
 * Rate Limiting Utilities
 *
 * Shared utilities for rate limiting including IP extraction and header generation.
 */

import type { RateLimitResult, RateLimitStatus } from './types';

/**
 * Extract client IP address from request headers
 *
 * Tries multiple headers in order of preference to handle various proxy configurations.
 * Handles: Cloudflare, nginx, load balancers, and direct connections.
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;

  // Priority order for IP extraction
  const ipHeaders = [
    'cf-connecting-ip', // Cloudflare
    'true-client-ip', // Cloudflare Enterprise
    'x-real-ip', // nginx proxy
    'x-forwarded-for', // Standard proxy header (may contain multiple IPs)
    'x-client-ip', // Alternative proxy header
  ];

  for (const header of ipHeaders) {
    const value = headers.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2, ...)
      // Take the first (original client) IP
      if (header === 'x-forwarded-for') {
        const firstIP = value.split(',')[0]?.trim();
        if (firstIP) return firstIP;
      } else {
        return value.trim();
      }
    }
  }

  // Fallback for development
  return '127.0.0.1';
}

/**
 * Create standardized rate limit headers for HTTP responses
 */
export function createRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const resetTimestamp = Math.floor(result.reset.getTime() / 1000);
  const retryAfter = Math.max(
    0,
    Math.ceil((result.reset.getTime() - Date.now()) / 1000)
  );

  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(resetTimestamp),
    ...(result.success ? {} : { 'Retry-After': String(retryAfter) }),
  };
}

/**
 * Create rate limit headers from status object (for in-memory limiters)
 */
export function createRateLimitHeadersFromStatus(
  status: RateLimitStatus
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(status.limit),
    'X-RateLimit-Remaining': String(status.remaining),
    'X-RateLimit-Reset': String(Math.ceil(status.resetTime / 1000)),
    ...(status.blocked
      ? { 'Retry-After': String(status.retryAfterSeconds) }
      : {}),
  };
}

/**
 * Create a rate limit key with prefix
 */
export function createRateLimitKey(
  prefix: string,
  identifier: string,
  type?: 'user' | 'ip' | 'creator'
): string {
  if (type) {
    return `${prefix}:${type}:${identifier}`;
  }
  return `${prefix}:${identifier}`;
}

/**
 * Format time remaining for user-friendly error messages
 */
export function formatTimeRemaining(resetTime: Date | number): string {
  const resetMs =
    typeof resetTime === 'number' ? resetTime : resetTime.getTime();
  const remainingMs = resetMs - Date.now();

  if (remainingMs <= 0) return 'now';

  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
