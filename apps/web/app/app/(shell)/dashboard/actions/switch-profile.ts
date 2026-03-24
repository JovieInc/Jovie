'use server';

import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';

/**
 * Switch the authenticated user's active profile.
 * Verifies ownership via userProfileClaims or legacy creatorProfiles.userId.
 * Lazy-backfills userProfileClaims if missing.
 */
export async function switchActiveProfile(
  profileId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return { success: false, error: 'Unauthorized' };
  }

  // Look up the database user
  const [user] = await db
    .select({ id: users.id, activeProfileId: users.activeProfileId })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Already active — no-op
  if (user.activeProfileId === profileId) {
    return { success: true };
  }

  // Verify ownership: check userProfileClaims first, then legacy userId
  const [claim] = await db
    .select({ id: userProfileClaims.id })
    .from(userProfileClaims)
    .where(
      and(
        eq(userProfileClaims.userId, user.id),
        eq(userProfileClaims.creatorProfileId, profileId)
      )
    )
    .limit(1);

  if (!claim) {
    // Fallback: check legacy creatorProfiles.userId
    const [legacyProfile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.id, profileId),
          eq(creatorProfiles.userId, user.id)
        )
      )
      .limit(1);

    if (!legacyProfile) {
      return { success: false, error: 'Profile not found or not owned' };
    }

    // Lazy backfill: insert missing userProfileClaims row
    await db
      .insert(userProfileClaims)
      .values({
        userId: user.id,
        creatorProfileId: profileId,
        role: 'owner',
      })
      .onConflictDoNothing();
  }

  // Switch active profile
  await db
    .update(users)
    .set({ activeProfileId: profileId, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

  return { success: true };
}

/**
 * Create an additional artist profile for the authenticated user.
 * Inserts the profile, creates a userProfileClaims row, and switches to it.
 */
export async function createAdditionalProfile(input: {
  displayName: string;
  username: string;
}): Promise<{ success: boolean; error?: string; profileId?: string }> {
  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return { success: false, error: 'Unauthorized' };
  }

  const trimmedDisplayName = input.displayName.trim();
  const normalizedUsername = input.username.trim().toLowerCase();

  if (!trimmedDisplayName) {
    return { success: false, error: 'Display name is required' };
  }
  if (!normalizedUsername) {
    return { success: false, error: 'Username is required' };
  }

  // Validate username format: alphanumeric, hyphens, underscores
  if (!/^[a-z0-9_-]+$/.test(normalizedUsername)) {
    return {
      success: false,
      error:
        'Username can only contain letters, numbers, hyphens, and underscores',
    };
  }

  // Look up the database user
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Soft limit: max 10 profiles per user
  const existingProfiles = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, user.id));

  if (existingProfiles.length >= 10) {
    return { success: false, error: 'Maximum of 10 profiles reached' };
  }

  // Check username uniqueness
  const [existingUsername] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, normalizedUsername))
    .limit(1);

  if (existingUsername) {
    return { success: false, error: 'Username already taken' };
  }

  // Create the profile (reusing pattern from createProfileForExistingUser)
  const [profile] = await db
    .insert(creatorProfiles)
    .values({
      userId: user.id,
      creatorType: 'artist',
      username: normalizedUsername,
      usernameNormalized: normalizedUsername,
      displayName: trimmedDisplayName,
      isPublic: true,
      isClaimed: true,
      claimedAt: new Date(),
      onboardingCompletedAt: new Date(),
      settings: {},
      theme: {},
      ingestionStatus: 'idle',
    })
    .returning({ id: creatorProfiles.id });

  if (!profile?.id) {
    return { success: false, error: 'Failed to create profile' };
  }

  // Insert userProfileClaims row
  await db.insert(userProfileClaims).values({
    userId: user.id,
    creatorProfileId: profile.id,
    role: 'owner',
  });

  // Switch to the new profile
  await db
    .update(users)
    .set({ activeProfileId: profile.id, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

  return { success: true, profileId: profile.id };
}
