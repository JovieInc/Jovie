import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';

// Redis client for rate limiting and caching
// Only initialize if UPSTASH_REDIS_REST_URL is provided
export const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export type RedisClient = typeof redis;

// Log initialization status
if (process.env.NODE_ENV === 'production') {
  if (!redis) {
    const message =
      'Redis not configured in production - rate limiting and caching disabled';
    console.error(`[redis] ⚠️ ${message}`);
    Sentry.captureMessage(message, 'warning');
  } else {
    console.log('[redis] ✓ Redis client initialized');
  }
} else if (redis) {
  console.log('[redis] ✓ Redis client initialized (development)');
}
