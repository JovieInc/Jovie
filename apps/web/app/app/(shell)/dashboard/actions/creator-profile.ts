'use server';

/**
 * Creator profile management server actions.
 *
 * This module provides server actions for updating and publishing
 * creator profile data, including display name, bio, avatar, and
 * public visibility settings.
 */

import { and, eq } from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { type CreatorProfile, creatorProfiles, users } from '@/lib/db/schema';

/**
 * Updates a creator profile with the provided data.
 *
 * This server action updates the specified profile fields for a creator
 * profile owned by the current user. It validates ownership via the
 * user's database ID and invalidates the profile cache after the update.
 *
 * @param profileId - The ID of the creator profile to update
 * @param updates - Partial object containing fields to update
 * @returns The updated CreatorProfile object
 * @throws Error if the user is not authenticated, user not found, or profile not found/unauthorized
 */
export async function updateCreatorProfile(
  profileId: string,
  updates: Partial<{
    marketingOptOut: boolean;
    displayName: string;
    bio: string;
    avatarUrl: string;
    onboardingCompletedAt: Date | null;
    isPublic: boolean;
    username: string;
    usernameNormalized: string;
    // Add other updatable fields as needed
  }>
): Promise<CreatorProfile> {
  // Prevent caching of mutations
  noStore();

  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return await withDbSession(async clerkUserId => {
    // First get the user's database ID
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    // Update the creator profile
    const [updatedProfile] = await db
      .update(creatorProfiles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creatorProfiles.id, profileId),
          eq(creatorProfiles.userId, user.id)
        )
      )
      .returning();

    if (!updatedProfile) {
      throw new Error('Profile not found or unauthorized');
    }

    // Use centralized cache invalidation
    await invalidateProfileCache(updatedProfile.usernameNormalized);

    return updatedProfile;
  });
}

/**
 * Form action for publishing basic creator profile information.
 *
 * This server action is designed to be used with HTML forms. It extracts
 * displayName and bio from FormData, validates the required fields, and
 * updates the profile to be public with onboarding marked as complete.
 *
 * @param formData - FormData containing profileId, displayName, and optional bio
 * @throws Error if profileId is missing or displayName is empty
 */
export async function publishProfileBasics(formData: FormData): Promise<void> {
  'use server';
  noStore();

  const profileId = formData.get('profileId');
  const displayNameRaw = formData.get('displayName');
  const bioRaw = formData.get('bio');

  if (!profileId || typeof profileId !== 'string') {
    throw new Error('Profile ID is required');
  }

  const displayName =
    typeof displayNameRaw === 'string' ? displayNameRaw.trim() : '';
  if (!displayName) {
    throw new Error('Display name is required');
  }

  const bio =
    typeof bioRaw === 'string' && bioRaw.trim().length > 0
      ? bioRaw.trim()
      : undefined;

  // updateCreatorProfile already handles cache invalidation via invalidateProfileCache
  await updateCreatorProfile(profileId, {
    displayName,
    bio,
    onboardingCompletedAt: new Date(),
    isPublic: true,
  });
}
