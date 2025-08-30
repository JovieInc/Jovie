import { Redis } from '@upstash/redis';

// Creates a Redis client using environment variables UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
// Throws an error if either environment variable is missing.
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error(
    "Missing required environment variables: UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN"
  );
}

export const redis = Redis.fromEnv();
