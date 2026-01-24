/**
 * Username availability checking with proper data isolation
 * This module provides secure username checking without exposing profile data
 */

import 'server-only';
import { eq } from 'drizzle-orm';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export interface UsernameAvailabilityResult {
  available: boolean;
  error?: string;
  validationError?: string;
}

/**
 * Check if a username is available for registration
 * This function only checks existence, doesn't return any profile data
 *
 * @param username - The username to check
 * @returns Availability result with error details if applicable
 */
export async function checkUsernameAvailability(
  username: string
): Promise<UsernameAvailabilityResult> {
  try {
    // First validate the username format
    const validation = validateUsername(username);
    if (!validation.isValid) {
      return {
        available: false,
        validationError: validation.error,
      };
    }

    // Normalize username for consistent checking
    const normalizedUsername = normalizeUsername(username);

    // Query only for existence - don't return any profile data
    // Use case-insensitive lookup to match the unique constraint
    const [existingProfile] = await db
      .select({ username: creatorProfiles.username })
      .from(creatorProfiles)
      .where(
        eq(creatorProfiles.usernameNormalized, normalizedUsername.toLowerCase())
      )
      .limit(1);

    // Username is available if no record found
    const available = !existingProfile;

    return {
      available,
      error: available ? undefined : 'Username is already taken',
    };
  } catch (error) {
    captureError('Database error checking username', error);
    return {
      available: false,
      error: 'Unable to check username availability. Please try again.',
    };
  }
}

/**
 * Check if current user already has a profile
 * Used to prevent duplicate profile creation
 *
 * @param clerkUserId - Clerk user ID
 * @returns True if user already has a profile
 */
export async function checkUserHasProfile(
  clerkUserId: string
): Promise<boolean> {
  try {
    return await withDbSession(
      async sessionClerkUserId => {
        // First get the user's database ID from Clerk ID
        const [user] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, sessionClerkUserId))
          .limit(1);

        if (!user) {
          // User doesn't exist in our database yet
          return false;
        }

        // Check if user has any creator profiles
        const [profile] = await db
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, user.id))
          .limit(1);

        return !!profile;
      },
      { clerkUserId }
    );
  } catch (error) {
    captureError('Error checking user profile', error);
    return false; // Assume no profile on error to allow creation attempt
  }
}
