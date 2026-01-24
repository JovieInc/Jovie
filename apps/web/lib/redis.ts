import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { captureError } from '@/lib/error-tracking';
import { env } from '@/lib/env-server';

// Lazy initialization with retry capability
// This prevents permanent null state if Redis is briefly unavailable during deployment
let _redis: Redis | null = null;
let _redisInitAttempted = false;
let _redisLastAttempt = 0;
const REDIS_RETRY_INTERVAL_MS = 30000; // 30 seconds between retry attempts

/**
 * Get Redis client with lazy initialization and retry capability.
 * If Redis was unavailable during initial module load, this will retry
 * initialization periodically (every 30s) to recover from transient failures.
 */
export function getRedis(): Redis | null {
  // Return cached client if available
  if (_redis) return _redis;

  const now = Date.now();

  // Don't retry too frequently - respect cooldown period
  if (
    _redisInitAttempted &&
    now - _redisLastAttempt < REDIS_RETRY_INTERVAL_MS
  ) {
    return null;
  }

  _redisInitAttempted = true;
  _redisLastAttempt = now;

  // Check if Redis is configured
  if (!env.UPSTASH_REDIS_REST_URL) {
    if (env.NODE_ENV === 'production' && !_redis) {
      Sentry.captureMessage(
        'Redis not configured in production - rate limiting and caching disabled',
        'warning'
      );
    }
    return null;
  }

  try {
    _redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });
    Sentry.addBreadcrumb({
      category: 'redis',
      message: 'Redis client initialized',
      level: 'info',
    });
    return _redis;
  } catch (error) {
    captureError('Redis initialization failed', error, {
      context: 'redis_init',
    });
    return null;
  }
}

// For backward compatibility - eagerly attempt initialization on first import
// but subsequent calls to getRedis() can retry if this fails
const _initialRedis = getRedis();

/**
 * @deprecated Prefer using getRedis() for automatic retry on transient failures.
 * Direct access to `redis` will not retry initialization if it fails on first import.
 */
export const redis = _initialRedis;

export type RedisClient = Redis | null;
