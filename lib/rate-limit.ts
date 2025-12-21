import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';

// Rate limiter for avatar uploads - 3 uploads per minute per user
export const avatarUploadRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 m'),
      analytics: true,
      prefix: 'avatar_upload',
    })
  : null;

// Rate limiter for API calls - 100 requests per minute per IP
export const apiRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      analytics: true,
      prefix: 'api_calls',
    })
  : null;

// Rate limiter for dashboard link management - 30 requests per minute per user
// This is stricter to prevent abuse of link CRUD operations
export const dashboardLinksRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 m'),
      analytics: true,
      prefix: 'dashboard_links',
    })
  : null;

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
};

/**
 * Helper to create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.reset.toISOString(),
  };
}
