/**
 * Validation functions for onboarding data
 */

'use server';

import { eq } from 'drizzle-orm';
import type { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  createOnboardingError,
  OnboardingErrorCode,
  onboardingErrorToError,
} from '@/lib/errors/onboarding';

type DbTransaction = Parameters<Parameters<typeof withDbSessionTx>[0]>[0];

/**
 * Validates that the provided email is not already in use by another user.
 */
export async function ensureEmailAvailable(
  tx: DbTransaction,
  clerkUserId: string,
  userEmail: string
): Promise<void> {
  try {
    const [emailOwner] = await tx
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1);

    if (emailOwner && emailOwner.clerkId !== clerkUserId) {
      throw onboardingErrorToError(
        createOnboardingError(
          OnboardingErrorCode.EMAIL_IN_USE,
          'Email is already in use'
        )
      );
    }
  } catch (error) {
    // Only report unexpected errors to Sentry; EMAIL_IN_USE is a normal
    // validation outcome, not a system failure.
    if (!isExpectedValidationError(error)) {
      await captureError('ensureEmailAvailable failed', error, {
        route: 'onboarding-validation',
      });
    }
    throw error;
  }
}

/**
 * Validates that the provided handle is not already in use by another profile.
 */
export async function ensureHandleAvailable(
  tx: DbTransaction,
  normalizedUsername: string,
  profileId?: string | null
): Promise<void> {
  try {
    const [conflict] = await tx
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, normalizedUsername))
      .limit(1);

    if (conflict && (!profileId || conflict.id !== profileId)) {
      const error = createOnboardingError(
        OnboardingErrorCode.USERNAME_TAKEN,
        'Handle already taken'
      );
      throw onboardingErrorToError(error);
    }
  } catch (error) {
    // Only report unexpected errors to Sentry; USERNAME_TAKEN is a normal
    // validation outcome, not a system failure.
    if (!isExpectedValidationError(error)) {
      await captureError('ensureHandleAvailable failed', error, {
        route: 'onboarding-validation',
      });
    }
    throw error;
  }
}

const EXPECTED_VALIDATION_CODES = new Set<string>([
  OnboardingErrorCode.EMAIL_IN_USE,
  OnboardingErrorCode.USERNAME_TAKEN,
]);

/** Returns true for known validation errors that should not be reported to Sentry. */
function isExpectedValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Error format from onboardingErrorToError: "[CODE] message"
  const match = error.message.match(/^\[([^\]]+)\]/);
  return match !== null && EXPECTED_VALIDATION_CODES.has(match[1]);
}
