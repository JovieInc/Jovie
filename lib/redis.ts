import { Redis } from '@upstash/redis';

// Guard Redis initialization when environment variables are missing
let redis: Redis | null = null;

try {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    redis = Redis.fromEnv();
  }
} catch (error) {
  console.warn('Redis initialization failed:', error);
}

export { redis };
