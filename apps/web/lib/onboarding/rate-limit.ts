/**
 * Onboarding Rate Limiting
 *
 * Rate limiting for onboarding operations using the unified rate limit module.
 * Provides security against handle squatting and brute-force attacks.
 */

import {
  createOnboardingError,
  OnboardingErrorCode,
  onboardingErrorToError,
} from '@/lib/errors/onboarding';
import {
  checkOnboardingRateLimit,
  formatTimeRemaining,
  generalLimiter,
  handleCheckLimiter,
} from '@/lib/rate-limit';

/**
 * Enforce onboarding rate limits using the unified rate limiter.
 *
 * Rate limits:
 * - 3 onboarding attempts per user per hour (Redis-backed, persistent)
 * - 3 onboarding attempts per IP per hour (Redis-backed, persistent)
 *
 * This is a CRITICAL security measure to prevent:
 * - Brute force handle enumeration
 * - Handle squatting attacks
 * - Abuse from compromised accounts
 */
export async function enforceOnboardingRateLimit({
  userId,
  ip,
  checkIP = true,
}: {
  userId: string;
  ip: string;
  checkIP?: boolean;
}): Promise<void> {
  const result = await checkOnboardingRateLimit(userId, ip, checkIP);

  if (!result.success) {
    const timeRemaining = formatTimeRemaining(result.reset);
    const isIpLimit = result.reason?.includes('network');

    const error = createOnboardingError(
      OnboardingErrorCode.RATE_LIMITED,
      isIpLimit
        ? `Too many onboarding attempts from this network. Please try again in ${timeRemaining}.`
        : `Too many onboarding attempts. Please try again in ${timeRemaining}.`
    );
    throw onboardingErrorToError(error);
  }
}

/**
 * Enforce rate limits for handle availability checks.
 *
 * Rate limits:
 * - 30 checks per IP per minute (Redis-backed, persistent)
 *
 * More lenient than onboarding to allow for UI feedback,
 * but still prevents enumeration attacks.
 */
export async function enforceHandleCheckRateLimit(ip: string): Promise<void> {
  const key = `ip:${ip}`;

  // Try the Redis-backed limiter first
  const result = await handleCheckLimiter.limit(key);

  if (!result.success) {
    const error = createOnboardingError(
      OnboardingErrorCode.RATE_LIMITED,
      'Too many handle checks. Please wait a moment before trying again.'
    );
    throw onboardingErrorToError(error);
  }
}

/**
 * General rate limit check for other endpoints.
 * Uses in-memory rate limiting for high-throughput scenarios.
 */
export async function enforceGeneralRateLimit(
  identifier: string
): Promise<void> {
  const result = await generalLimiter.limit(identifier);

  if (!result.success) {
    const error = createOnboardingError(
      OnboardingErrorCode.RATE_LIMITED,
      'Too many requests. Please wait a moment before trying again.'
    );
    throw onboardingErrorToError(error);
  }
}
