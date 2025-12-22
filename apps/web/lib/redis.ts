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
