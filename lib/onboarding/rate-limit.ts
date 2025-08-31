import {
  createOnboardingError,
  OnboardingErrorCode,
} from '@/lib/errors/onboarding';
import { redis } from '@/lib/redis';

/**
 * Enforce onboarding rate limits keyed by both user ID and IP address.
 * @param params.userId - Authenticated user's ID
 * @param params.ip - Client IP address
 * @param params.limit - Max attempts allowed within the window
 * @param params.window - Time window in seconds for rate limiting
 * @throws Error with code OnboardingErrorCode.RATE_LIMITED when limit exceeded
 */
export async function enforceOnboardingRateLimit({
  userId,
  ip,
  limit = 5,
  window = 60,
}: {
  userId: string;
  ip: string;
  limit?: number;
  window?: number;
}): Promise<void> {
  const userKey = `onboarding:user:${userId}`;
  const ipKey = `onboarding:ip:${ip}`;

  try {
    const [userCount, ipCount] = await Promise.all([
      redis.incr(userKey),
      redis.incr(ipKey),
    ]);

    if (userCount === 1) {
      await redis.expire(userKey, window);
    }
    if (ipCount === 1) {
      await redis.expire(ipKey, window);
    }

    if (userCount > limit || ipCount > limit) {
      const error = createOnboardingError(
        OnboardingErrorCode.RATE_LIMITED,
        'Too many onboarding attempts. Please wait and try again.'
      );
      const err = new Error(error.message);
      (err as Error & { code?: OnboardingErrorCode }).code = error.code;
      throw err;
    }
  } catch (err) {
    // Fail open on Redis errors to avoid blocking onboarding if rate limiter fails
    console.error('Onboarding rate limiter error:', err);
  }
}
