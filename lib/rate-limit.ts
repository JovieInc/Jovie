import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';

// Rate limiter for avatar uploads - 3 uploads per minute per user
export const avatarUploadRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 m'),
  analytics: true,
  prefix: 'avatar_upload',
}) : null;

// Rate limiter for API calls - 100 requests per minute per IP
export const apiRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  analytics: true,
  prefix: 'api_calls',
}) : null;

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
};