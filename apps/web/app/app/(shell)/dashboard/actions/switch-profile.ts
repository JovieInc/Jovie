'use server';

import { and, eq, exists } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { attachFirstTouchReceipt } from '@/lib/acquisition/activation-receipt';
import { appUserIdFilter } from '@/lib/auth/app-user-id';
import { getCachedAuth } from '@/lib/auth/cached';
import { setupDbSession } from '@/lib/auth/session';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import {
  runAtomicDbOperation,
  runLegacyDbTransaction,
} from '@/lib/db/legacy-transaction';
import { writableProfileForUser } from '@/lib/db/queries/profile-ownership';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_PROFILES_PER_USER = 10;

/**
 * Switch the authenticated user's active profile.
 * Rechecks canonical access even for an already-selected profile. Selection
 * never grants ownership or creates a claim from a legacy compatibility field.
 */
export async function switchActiveProfile(
  profileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId: appUserId } = await getCachedAuth();
    if (!appUserId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!UUID_RE.test(profileId)) {
      return { success: false, error: 'Invalid profile ID' };
    }

    const [updated] = await runAtomicDbOperation(
      tx =>
        tx
          .update(users)
          .set({ activeProfileId: profileId, updatedAt: new Date() })
          .where(
            and(
              appUserIdFilter(appUserId),
              exists(
                tx
                  .select({ id: creatorProfiles.id })
                  .from(creatorProfiles)
                  .where(
                    and(
                      eq(creatorProfiles.id, profileId),
                      writableProfileForUser(appUserId)
                    )
                  )
              )
            )
          )
          .returning({ id: users.id }),
      { actorId: appUserId, retry: 'never' }
    );

    if (!updated) {
      return { success: false, error: 'Profile not found or not owned' };
    }

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
    const { userId: appUserId } = await getCachedAuth();
    if (!appUserId) {
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
    if (isReservedPublicProfileIdentity(normalizedUsername)) {
      return { success: false, error: 'Username is reserved' };
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

    await setupDbSession(appUserId);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(appUserIdFilter(appUserId))
      .limit(1);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const existingProfiles = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, user.id));

    if (existingProfiles.length >= MAX_PROFILES_PER_USER) {
      return {
        success: false,
        error: `Maximum of ${MAX_PROFILES_PER_USER} profiles reached`,
      };
    }

    const profile = await runLegacyDbTransaction(async tx => {
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

      await tx.insert(userProfileClaims).values({
        userId: user.id,
        creatorProfileId: newProfile.id,
        role: 'owner',
      });

      await tx
        .update(users)
        .set({ activeProfileId: newProfile.id, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return newProfile;
    });

    revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

    // Passive first-touch receipt (JOV-5036): idempotent, best-effort.
    await attachFirstTouchReceipt(user.id);

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
