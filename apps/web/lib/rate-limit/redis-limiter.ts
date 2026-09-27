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

const REDIS_FALLBACK_MESSAGE =
  'Rate limiter falling back to in-memory store — Redis unconfigured';
let hasWarnedRedisFallback = false;

function warnRedisFallbackOnce(config: RateLimitConfig): void {
  if (hasWarnedRedisFallback) return;
  hasWarnedRedisFallback = true;

  console.error(REDIS_FALLBACK_MESSAGE);
  Sentry.captureMessage(REDIS_FALLBACK_MESSAGE, {
    level: 'error',
    tags: {
      limiter: config.name,
      'rate_limit.prefix': config.prefix,
    },
    extra: {
      algorithm: config.algorithm,
      analytics: config.analytics ?? false,
      limit: config.limit,
      window: config.window,
    },
  });
}

/** Test-only helper to reset the process-scoped fallback warning. */
export function resetRedisFallbackWarningForTests(): void {
  hasWarnedRedisFallback = false;
}

/**
 * Parse window string to Upstash duration format
 * Converts '1 m' to '1m', '1 h' to '1h', etc.
 */
function toUpstashWindow(
  window: string
): Parameters<typeof Ratelimit.slidingWindow>[1] {
  const normalized = window.replaceAll(/\s+/g, '');

  // Map our format to Upstash format
  const match = /^(\d+)([smhd])$/.exec(normalized);
  if (!match) {
    throw new SyntaxError(`Invalid window format: ${window}`);
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
      warnRedisFallbackOnce(config);
    }
    return null;
  }

  const window = toUpstashWindow(config.window);
  const limiter =
    config.algorithm === 'sliding-window'
      ? Ratelimit.slidingWindow(config.limit, window)
      : Ratelimit.fixedWindow(config.limit, window);

  return new Ratelimit({
    redis: redisClient,
    limiter,
    analytics: config.analytics ?? false,
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
