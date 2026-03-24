'use server';

import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_PROFILES_PER_USER = 10;

/**
 * Switch the authenticated user's active profile.
 * Verifies ownership via userProfileClaims or legacy creatorProfiles.userId.
 * Lazy-backfills userProfileClaims if missing.
 */
export async function switchActiveProfile(
  profileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId: clerkUserId } = await getCachedAuth();
    if (!clerkUserId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!UUID_RE.test(profileId)) {
      return { success: false, error: 'Invalid profile ID' };
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
  } catch (error) {
    await captureError('switchActiveProfile failed', error, {
      route: 'switch-profile',
    });
    return { success: false, error: 'Something went wrong' };
  }
}

/**
 * Create an additional artist profile for the authenticated user.
 * Inserts the profile, creates a userProfileClaims row, and switches to it.
 * All writes run in a single transaction for atomicity.
 */
export async function createAdditionalProfile(input: {
  displayName: string;
  username: string;
}): Promise<{ success: boolean; error?: string; profileId?: string }> {
  try {
    const { userId: clerkUserId } = await getCachedAuth();
    if (!clerkUserId) {
      return { success: false, error: 'Unauthorized' };
    }

    const trimmedDisplayName = input.displayName.trim();
    const normalizedUsername = input.username.trim().toLowerCase();

    if (!trimmedDisplayName) {
      return { success: false, error: 'Display name is required' };
    }
    if (trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
      return {
        success: false,
        error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`,
      };
    }
    if (!normalizedUsername) {
      return { success: false, error: 'Username is required' };
    }
    if (
      normalizedUsername.length < MIN_USERNAME_LENGTH ||
      normalizedUsername.length > MAX_USERNAME_LENGTH
    ) {
      return {
        success: false,
        error: `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters`,
      };
    }
    if (!USERNAME_RE.test(normalizedUsername)) {
      return {
        success: false,
        error:
          'Username must start and end with a letter or number, and can contain hyphens and underscores',
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

    // Soft limit: max profiles per user (count via claims for accuracy)
    const existingClaims = await db
      .select({ id: userProfileClaims.creatorProfileId })
      .from(userProfileClaims)
      .where(eq(userProfileClaims.userId, user.id));

    if (existingClaims.length >= MAX_PROFILES_PER_USER) {
      return {
        success: false,
        error: `Maximum of ${MAX_PROFILES_PER_USER} profiles reached`,
      };
    }

    // All writes in a single transaction for atomicity
    const profile = await db.transaction(async tx => {
      const [newProfile] = await tx
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

      if (!newProfile?.id) {
        throw new Error('Failed to create profile');
      }

      // Insert userProfileClaims row
      await tx.insert(userProfileClaims).values({
        userId: user.id,
        creatorProfileId: newProfile.id,
        role: 'owner',
      });

      // Switch to the new profile
      await tx
        .update(users)
        .set({ activeProfileId: newProfile.id, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return newProfile;
    });

    revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

    return { success: true, profileId: profile.id };
  } catch (error) {
    // Catch unique constraint violation on username
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('unique') ||
      message.includes('duplicate') ||
      message.includes('username_normalized')
    ) {
      return { success: false, error: 'Username already taken' };
    }

    await captureError('createAdditionalProfile failed', error, {
      route: 'switch-profile',
    });
    return { success: false, error: 'Something went wrong' };
  }
}
