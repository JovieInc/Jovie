'use server';

import { auth } from '@clerk/nextjs/server';
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
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export async function completeOnboarding({
  username,
  displayName,
  email,
}: {
  username: string;
  displayName?: string;
  email?: string | null;
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
    const headersList = await headers();
    const clientIP = extractClientIP(headersList);

    // IMPORTANT: Always check IP-based rate limiting, even for 'unknown' IPs
    // The 'unknown' bucket acts as a shared rate limit to prevent abuse
    // from users behind proxies or with missing/invalid headers
    const shouldCheckIP = true;

    await enforceOnboardingRateLimit({
      userId,
      ip: clientIP,
      checkIP: shouldCheckIP,
    });

    // Step 4-6: Parallel operations for performance optimization
    const normalizedUsername = normalizeUsername(username);

    // Run checks in parallel to reduce total operation time
    const [hasExistingProfile, availabilityResult] = await Promise.all([
      checkUserHasProfile(userId),
      checkUsernameAvailability(normalizedUsername),
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
    const userEmail = email ?? null;

    // Step 8: Create user and profile via stored function in a single DB call (RLS-safe on neon-http)
    try {
      // Defensive check: Verify the stored function exists (helps diagnose deployment issues)
      const functionCheck = await db.execute(
        drizzleSql`
          SELECT EXISTS(
            SELECT 1 FROM pg_proc
            WHERE proname = 'onboarding_create_profile'
          ) AS function_exists
        `
      );

      const functionExists = functionCheck.rows[0]?.function_exists;

      if (!functionExists) {
        console.error(
          '🔴 CRITICAL: onboarding_create_profile function does not exist!',
          {
            environment: process.env.VERCEL_ENV || 'local',
            databaseUrl: process.env.DATABASE_URL
              ? 'SET (redacted for security)'
              : 'MISSING',
            nodeEnv: process.env.NODE_ENV,
          }
        );
        throw new Error(
          'Database migration error: onboarding_create_profile function not found. Please contact support.'
        );
      }

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
      console.error('Error creating user and profile via function:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'unknown',
        userId: userId.substring(0, 8) + '...', // Log partial ID for debugging
        username: normalizedUsername,
        environment: process.env.VERCEL_ENV || 'local',
        nodeEnv: process.env.NODE_ENV,
        stack: error instanceof Error ? error.stack : undefined,
      });
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
