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

// CRITICAL: Rate limiter for onboarding - 3 attempts per hour per user
// This is stricter than the general API rate limit to prevent abuse
// Uses Redis for persistence across server restarts and instances
export const onboardingRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      analytics: true,
      prefix: 'onboarding',
    })
  : null;

// Rate limiter for handle availability checks - 30 per minute per IP
// More lenient than onboarding but still prevents enumeration attacks
export const handleCheckRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 m'),
      analytics: true,
      prefix: 'handle_check',
    })
  : null;

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
};
