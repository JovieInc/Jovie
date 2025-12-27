import {
  createOnboardingError,
  OnboardingErrorCode,
} from '@/lib/errors/onboarding';
import { handleCheckRateLimit, onboardingRateLimit } from '@/lib/rate-limit';
import { createScopedLogger } from '@/lib/utils/logger';
import { checkRateLimit } from '@/lib/utils/rate-limit';

const log = createScopedLogger('OnboardingRateLimit');

// In-memory fallback tracking for when Redis is unavailable
// This provides basic protection but doesn't persist across restarts
const inMemoryOnboardingAttempts = new Map<
  string,
  { count: number; resetTime: number }
>();

const ONBOARDING_LIMIT = 3; // 3 attempts per hour
const ONBOARDING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check in-memory rate limit as fallback when Redis is unavailable
 */
function checkInMemoryOnboardingLimit(key: string): boolean {
  const now = Date.now();
  const entry = inMemoryOnboardingAttempts.get(key);

  // Clean up expired entries periodically (25% chance for more predictable memory usage)
  if (Math.random() < 0.25) {
    for (const [k, v] of inMemoryOnboardingAttempts.entries()) {
      if (now > v.resetTime) {
        inMemoryOnboardingAttempts.delete(k);
      }
    }
  }

  if (!entry || now > entry.resetTime) {
    // First request or window expired
    inMemoryOnboardingAttempts.set(key, {
      count: 1,
      resetTime: now + ONBOARDING_WINDOW_MS,
    });
    return false; // Not rate limited
  }

  if (entry.count >= ONBOARDING_LIMIT) {
    return true; // Rate limited
  }

  // Increment counter
  entry.count += 1;
  return false;
}

/**
 * Enforce onboarding rate limits using Redis-backed rate limiter with in-memory fallback.
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
  const userKey = `user:${userId}`;

  // Try Redis-backed rate limiting first (preferred)
  if (onboardingRateLimit) {
    const userResult = await onboardingRateLimit.limit(userKey);

    if (!userResult.success) {
      const error = createOnboardingError(
        OnboardingErrorCode.RATE_LIMITED,
        `Too many onboarding attempts. Please try again in ${Math.ceil((userResult.reset - Date.now()) / 60000)} minutes.`
      );
      throw error;
    }

    if (checkIP) {
      const ipKey = `ip:${ip}`;
      const ipResult = await onboardingRateLimit.limit(ipKey);

      if (!ipResult.success) {
        const error = createOnboardingError(
          OnboardingErrorCode.RATE_LIMITED,
          `Too many onboarding attempts from this network. Please try again in ${Math.ceil((ipResult.reset - Date.now()) / 60000)} minutes.`
        );
        throw error;
      }
    }

    return;
  }

  // Fallback to in-memory rate limiting when Redis is unavailable
  // This provides basic protection but doesn't persist across restarts or scale across instances
  log.warn('Redis unavailable, using in-memory fallback');

  if (checkInMemoryOnboardingLimit(userKey)) {
    const error = createOnboardingError(
      OnboardingErrorCode.RATE_LIMITED,
      'Too many onboarding attempts. Please wait and try again later.'
    );
    throw error;
  }

  if (checkIP) {
    const ipKey = `ip:${ip}`;
    if (checkInMemoryOnboardingLimit(ipKey)) {
      const error = createOnboardingError(
        OnboardingErrorCode.RATE_LIMITED,
        'Too many onboarding attempts from this network. Please wait and try again later.'
      );
      throw error;
    }
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

  // Try Redis-backed rate limiting first
  if (handleCheckRateLimit) {
    const result = await handleCheckRateLimit.limit(key);

    if (!result.success) {
      const error = createOnboardingError(
        OnboardingErrorCode.RATE_LIMITED,
        'Too many handle checks. Please wait a moment before trying again.'
      );
      throw error;
    }

    return;
  }

  // Fallback to existing in-memory rate limiter
  const rateLimitKey = `handle-check:${ip}`;
  if (checkRateLimit(rateLimitKey)) {
    const error = createOnboardingError(
      OnboardingErrorCode.RATE_LIMITED,
      'Too many handle checks. Please wait a moment before trying again.'
    );
    throw error;
  }
}
