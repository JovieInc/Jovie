import {
  createOnboardingError,
  OnboardingErrorCode,
} from '@/lib/errors/onboarding';
import { checkRateLimit } from '@/lib/utils/rate-limit';

/**
 * Enforce onboarding rate limits using the in-memory rate limiter.
 * Falls back gracefully during early stages before real traffic arrives.
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
  // The global in-memory rate limiter handles storage; custom limits are not yet supported.
  // Identifiers are namespaced to keep counts separate from other uses.
  const userKey = `onboarding:user:${userId}`;
  if (checkRateLimit(userKey)) {
    const error = createOnboardingError(
      OnboardingErrorCode.RATE_LIMITED,
      'Too many onboarding attempts. Please wait and try again.'
    );
    throw error;
  }

  if (checkIP && ip !== 'unknown') {
    const ipKey = `onboarding:ip:${ip}`;
    if (checkRateLimit(ipKey)) {
      const error = createOnboardingError(
        OnboardingErrorCode.RATE_LIMITED,
        'Too many onboarding attempts. Please wait and try again.'
      );
      throw error;
    }
  }
}
