import {
  createOnboardingError,
  OnboardingErrorCode,
} from '@/lib/errors/onboarding';
import { redis } from '@/lib/redis';

// Default rate limiting configuration
export const ONBOARDING_RATE_LIMIT = {
  DEFAULT_LIMIT: 5,
  DEFAULT_WINDOW: 60, // seconds
} as const;

/**
 * Enforce onboarding rate limits keyed by both user ID and IP address.
 * @param params.userId - Authenticated user's ID
 * @param params.ip - Client IP address
 * @param params.limit - Max attempts allowed within the window
 * @param params.window - Time window in seconds for rate limiting
 * @param params.checkIP - Whether to check IP rate limiting (default: true)
 * @throws Error with code OnboardingErrorCode.RATE_LIMITED when limit exceeded
 */
export async function enforceOnboardingRateLimit({
  userId,
  ip,
  limit = ONBOARDING_RATE_LIMIT.DEFAULT_LIMIT,
  window = ONBOARDING_RATE_LIMIT.DEFAULT_WINDOW,
  checkIP = true,
}: {
  userId: string;
  ip: string;
  limit?: number;
  window?: number;
  checkIP?: boolean;
}): Promise<void> {
  const userKey = `onboarding:user:${userId}`;
  const ipKey = `onboarding:ip:${ip}`;

  try {
    if (!redis) {
      // Fail open if Redis is not available
      return;
    }

    // Always check user rate limit
    const userCount = await redis.incr(userKey);

    // Set expiry only if this is the first request (count = 1)
    if (userCount === 1) {
      await redis.expire(userKey, window);
    }

    // Check IP rate limit only if requested and IP is valid
    let ipCount = 0;
    if (checkIP && ip !== 'unknown') {
      ipCount = await redis.incr(ipKey);

      // Set expiry only if this is the first request (count = 1)
      if (ipCount === 1) {
        await redis.expire(ipKey, window);
      }
    }

    if (userCount > limit || (checkIP && ipCount > limit)) {
      const error = createOnboardingError(
        OnboardingErrorCode.RATE_LIMITED,
        'Too many onboarding attempts. Please wait and try again.'
      );
      throw error;
    }
  } catch (err) {
    // Only swallow Redis/infrastructure errors; rethrow intentional rate limit errors
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: OnboardingErrorCode }).code ===
        OnboardingErrorCode.RATE_LIMITED
    ) {
      throw err;
    }
    // Fail open on Redis infrastructure errors to avoid blocking onboarding
    console.error('Onboarding rate limiter error:', err);
  }
}
