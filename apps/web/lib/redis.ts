import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

// Lazy initialization with retry capability
// This prevents permanent null state if Redis is briefly unavailable during deployment
let _redis: Redis | null = null;
let _redisInitAttempted = false;
let _redisLastAttempt = 0;
let _redisMissingConfigWarned = false;
const REDIS_RETRY_INTERVAL_MS = 30000; // 30 seconds between retry attempts

function isValidUpstashRestUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  // Upstash REST client requires https. Invalid placeholders / empty / rediss://
  // must fail soft — never throw during Next page data collection / build.
  return /^https:\/\//i.test(trimmed);
}

function getUpstashConfig(): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!isValidUpstashRestUrl(url) || !token?.trim()) {
    return null;
  }
  return { url: url.trim(), token: token.trim() };
}

export interface GetRedisOptions {
  signal?: AbortSignal;
}

function captureMissingRedisConfigWarningOnce(): void {
  if (env.NODE_ENV !== 'production' || _redis || _redisMissingConfigWarned) {
    return;
  }

  Sentry.captureMessage(
    'Redis not configured in production - rate limiting and caching disabled',
    'warning'
  );
  _redisMissingConfigWarned = true;
}

/**
 * Get Redis client with lazy initialization and retry capability.
 * If Redis was unavailable during initial module load, this will retry
 * initialization periodically (every 30s) to recover from transient failures.
 */
export function getRedis(options?: GetRedisOptions): Redis | null {
  if (options?.signal) {
    const cfg = getUpstashConfig();
    if (!cfg) {
      captureMissingRedisConfigWarningOnce();
      return null;
    }

    try {
      return new Redis({
        url: cfg.url,
        token: cfg.token,
        signal: options.signal,
      });
    } catch (error) {
      captureError('Redis initialization failed', error, {
        context: 'redis_init',
      });
      return null;
    }
  }

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

  // Check if Redis is configured (both URL and token are required)
  const cfg = getUpstashConfig();
  if (!cfg) {
    captureMissingRedisConfigWarningOnce();
    return null;
  }

  try {
    _redis = new Redis({
      url: cfg.url,
      token: cfg.token,
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
