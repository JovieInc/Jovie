/**
 * Profile Service Mutations
 *
 * Centralized profile update operations.
 */

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import type { ProfileData, ProfileUpdateData } from './types';

/**
 * Update a profile by ID.
 *
 * @param profileId - The profile ID to update
 * @param updates - The fields to update
 * @returns Updated profile or null if not found
 */
export async function updateProfileById(
  profileId: string,
  updates: ProfileUpdateData
): Promise<ProfileData | null> {
  const [updated] = await db
    .update(creatorProfiles)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning();

  if (updated?.usernameNormalized) {
    await invalidateProfileCache(updated.usernameNormalized);
  }

  return updated ?? null;
}

/**
 * Update a profile by user's Clerk ID.
 *
 * @param clerkUserId - The Clerk user ID
 * @param updates - The fields to update
 * @returns Updated profile or null if not found
 */
export async function updateProfileByClerkId(
  clerkUserId: string,
  updates: ProfileUpdateData
): Promise<ProfileData | null> {
  // First get the user ID from clerk_id
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  const [updated] = await db
    .update(creatorProfiles)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.userId, user.id))
    .returning();

  if (updated?.usernameNormalized) {
    await invalidateProfileCache(updated.usernameNormalized);
  }

  return updated ?? null;
}

/**
 * Increment profile view count atomically with retry logic.
 *
 * @param username - The username to increment views for
 * @param maxRetries - Maximum retry attempts (default: 3)
 */
export async function incrementProfileViews(
  username: string,
  maxRetries = 3
): Promise<void> {
  const normalizedUsername = username.toLowerCase();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db
        .update(creatorProfiles)
        .set({
          profileViews: drizzleSql`${creatorProfiles.profileViews} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.usernameNormalized, normalizedUsername));

      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      console.warn(
        `[profile-service] View increment retry ${attempt}/${maxRetries}:`,
        lastError.message
      );

      if (attempt < maxRetries) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }

  console.error(
    `[profile-service] View increment failed after ${maxRetries} attempts:`,
    lastError
  );

  // Report to Sentry (fire-and-forget)
  import('@/lib/error-tracking')
    .then(({ captureError }) => {
      captureError('Profile view increment failed', lastError, {
        username: normalizedUsername,
        maxRetries,
      });
    })
    .catch(() => {});
}

/**
 * Publish a profile (set isPublic=true, mark onboarding complete).
 *
 * @param profileId - The profile ID
 * @param displayName - The display name to set
 * @param bio - Optional bio
 * @returns Updated profile or null
 */
export async function publishProfile(
  profileId: string,
  displayName: string,
  bio?: string
): Promise<ProfileData | null> {
  return updateProfileById(profileId, {
    displayName,
    bio,
    isPublic: true,
    onboardingCompletedAt: new Date(),
  });
}
