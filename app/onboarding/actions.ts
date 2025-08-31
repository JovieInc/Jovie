'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  createOnboardingError,
  mapDatabaseError,
  OnboardingErrorCode,
} from '@/lib/errors/onboarding';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import {
  checkUserHasProfile,
  checkUsernameAvailability,
} from '@/lib/username/availability';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export async function completeOnboarding({
  username,
  displayName,
}: {
  username: string;
  displayName?: string;
}) {
  try {
    // Step 1: Authentication check
    const { userId } = await auth();
    if (!userId) {
      const error = createOnboardingError(
        OnboardingErrorCode.NOT_AUTHENTICATED,
        'User not authenticated'
      );
      throw new Error(error.message);
    }

    // Step 2: Input validation
    const validation = validateUsername(username);
    if (!validation.isValid) {
      const error = createOnboardingError(
        OnboardingErrorCode.INVALID_USERNAME,
        validation.error || 'Invalid username'
      );
      throw new Error(error.message);
    }

    if (displayName && displayName.trim().length > 50) {
      const error = createOnboardingError(
        OnboardingErrorCode.DISPLAY_NAME_TOO_LONG,
        'Display name must be 50 characters or less'
      );
      throw new Error(error.message);
    }

    // Step 3: Rate limiting check
    const headersList = headers();
    const forwarded = headersList.get('x-forwarded-for');
    const clientIP = forwarded ? forwarded.split(',')[0] : 'unknown';

    await enforceOnboardingRateLimit({ userId, ip: clientIP });

    // Step 4-6: Parallel operations for performance optimization
    const normalizedUsername = normalizeUsername(username);

    // Run checks in parallel to reduce total operation time
    const [hasExistingProfile, availabilityResult, user] = await Promise.all([
      checkUserHasProfile(userId),
      checkUsernameAvailability(normalizedUsername),
      currentUser(),
    ]);

    // Early exit if user already has profile
    if (hasExistingProfile) {
      redirect('/dashboard');
    }

    // Check username availability
    if (!availabilityResult.available) {
      const errorCode = availabilityResult.validationError
        ? OnboardingErrorCode.INVALID_USERNAME
        : OnboardingErrorCode.USERNAME_TAKEN;

      const error = createOnboardingError(
        errorCode,
        availabilityResult.error ||
          availabilityResult.validationError ||
          'Username not available'
      );
      throw new Error(error.message);
    }

    // Step 7: Prepare user data for database operations
    const userEmail = user?.emailAddresses?.[0]?.emailAddress;

    // Step 8: Create user and profile via stored function in a single DB call (RLS-safe on neon-http)
    try {
      await db.execute(
        drizzleSql`
          SELECT onboarding_create_profile(
            ${userId},
            ${userEmail ?? null},
            ${normalizedUsername},
            ${displayName?.trim() || normalizedUsername}
          ) AS profile_id
        `
      );
    } catch (error) {
      console.error('Error creating user and profile via function:', error);
      const mappedError = mapDatabaseError(error);
      throw new Error(mappedError.message);
    }

    // Success - redirect to dashboard
    redirect('/dashboard');
  } catch (error) {
    console.error('🔴 ONBOARDING ERROR:', error);
    console.error(
      '🔴 ERROR STACK:',
      error instanceof Error ? error.stack : 'No stack available'
    );
    throw error;
  }
}
