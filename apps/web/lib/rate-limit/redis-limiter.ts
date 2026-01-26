/**
 * Redis Rate Limiter Factory
 *
 * Creates Upstash Redis-backed rate limiters with consistent configuration.
 */

import * as Sentry from '@sentry/nextjs';
import { Ratelimit } from '@upstash/ratelimit';

import { env } from '@/lib/env-server';
import { getRedis } from '@/lib/redis';
import type { RateLimitConfig } from './types';

/**
 * Parse window string to Upstash duration format
 * Converts '1 m' to '1m', '1 h' to '1h', etc.
 */
function toUpstashWindow(
  window: string
): Parameters<typeof Ratelimit.slidingWindow>[1] {
  const normalized = window.replaceAll(/\s+/g, '');

  // Map our format to Upstash format
  const match = normalized.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid window format: ${window}`);
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  // Upstash uses 'ms' for milliseconds, 's' for seconds, 'm' for minutes, etc.
  return `${value} ${unit}` as Parameters<typeof Ratelimit.slidingWindow>[1];
}

/**
 * Create a Redis-backed rate limiter
 * Returns null if Redis is not configured or unavailable
 */
export function createRedisRateLimiter(
  config: RateLimitConfig
): Ratelimit | null {
  const redisClient = getRedis();
  if (!redisClient) {
    if (env.NODE_ENV === 'production') {
      Sentry.captureMessage(
        `Rate limiter "${config.name}" falling back to memory - Redis unavailable`,
        'warning'
      );
    }
    return null;
  }

  return new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(
      config.limit,
      toUpstashWindow(config.window)
    ),
    analytics: config.analytics ?? true,
    prefix: config.prefix,
  });
}

/**
 * Check if Redis is available for rate limiting
 */
export function isRedisAvailable(): boolean {
  return getRedis() !== null;
}

/**
 * Get the Redis client (for advanced use cases)
 */
export function getRedisClient() {
  return getRedis();
}
