'use server';

/**
 * Creator profile management server actions.
 *
 * This module provides server actions for updating and publishing
 * creator profile data, including display name, bio, avatar, and
 * public visibility settings.
 */

import { and, sql as drizzleSql, eq, exists } from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { attachFirstTouchReceipt } from '@/lib/acquisition/activation-receipt';
import { appUserIdFilter } from '@/lib/auth/app-user-id';
import { getCachedAuth } from '@/lib/auth/cached';
import { isCanonicalUuid } from '@/lib/auth/profile-access';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  getActiveWritableProfile,
  writableProfileForUser,
} from '@/lib/db/queries/profile-ownership';
import { users } from '@/lib/db/schema/auth';
import { type CreatorProfile, creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { isContentClean } from '@/lib/validation/content-filter';

const EXPECTED_PROFILE_ACTION_ERRORS = new Set([
  'Unauthorized',
  'User not found',
  'Profile not found',
  'Profile not found or unauthorized',
]);

function isExpectedProfileActionError(error: unknown): boolean {
  return (
    error instanceof Error && EXPECTED_PROFILE_ACTION_ERRORS.has(error.message)
  );
}

/**
 * Updates a creator profile with the provided data.
 *
 * This server action updates the specified profile fields for a creator
 * writable by the current account under canonical claims precedence. Public
 * and owner caches are invalidated only after the transaction commits.
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

  try {
    const { userId } = await getCachedAuth();

    if (!userId) {
      throw new Error('Unauthorized');
    }

    if (!isCanonicalUuid(profileId)) {
      throw new TypeError('Profile not found or unauthorized');
    }

    const { updatedProfile, oldUsername } = await runAtomicDbOperation(
      async tx => {
        const [existing] = await tx
          .select({ usernameNormalized: creatorProfiles.usernameNormalized })
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              writableProfileForUser(userId)
            )
          )
          .limit(1);
        if (!existing) throw new TypeError('Profile not found or unauthorized');

        // Server-action input is untrusted at runtime. Never spread arbitrary
        // fields into persistence (notably id, userId, or ownership metadata).
        const [updatedProfile] = await tx
          .update(creatorProfiles)
          .set({
            marketingOptOut: updates.marketingOptOut,
            displayName: updates.displayName,
            bio: updates.bio,
            avatarUrl: updates.avatarUrl,
            onboardingCompletedAt: updates.onboardingCompletedAt,
            isPublic: updates.isPublic,
            username: updates.username,
            usernameNormalized: updates.usernameNormalized,
            profileEditVersion: drizzleSql`${creatorProfiles.profileEditVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              writableProfileForUser(userId),
              exists(
                tx
                  .select({ id: users.id })
                  .from(users)
                  .where(appUserIdFilter(userId))
              )
            )
          )
          .returning();
        if (!updatedProfile)
          throw new TypeError('Profile not found or unauthorized');
        return { updatedProfile, oldUsername: existing.usernameNormalized };
      },
      { actorId: userId, retry: 'never' }
    );

    await invalidateProfileCache(
      updatedProfile.usernameNormalized,
      oldUsername
    );
    return updatedProfile;
  } catch (error) {
    if (!isExpectedProfileActionError(error)) {
      await captureError('updateCreatorProfile failed', error, {
        route: 'dashboard/actions/creator-profile',
        profileId,
      });
    }
    throw error;
  }
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
  noStore();

  try {
    const profileId = formData.get('profileId');
    const displayNameRaw = formData.get('displayName');
    const bioRaw = formData.get('bio');

    if (!profileId || typeof profileId !== 'string') {
      throw new TypeError('Profile ID is required');
    }

    const displayName =
      typeof displayNameRaw === 'string' ? displayNameRaw.trim() : '';
    if (!displayName) {
      throw new TypeError('Display name is required');
    }
    if (!isContentClean(displayName)) {
      throw new TypeError('Display name contains language that is not allowed');
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

    // Passive first-touch receipt (JOV-5036): idempotent, best-effort.
    const { userId } = await getCachedAuth();
    if (userId) {
      await attachFirstTouchReceipt(userId);
    }
  } catch (error) {
    // updateCreatorProfile already captures unexpected runtime errors.
    // Only capture validation errors thrown before that call.
    if (!isExpectedProfileActionError(error)) {
      await captureError('publishProfileBasics failed', error, {
        route: 'dashboard/actions/creator-profile',
      });
    }
    throw error;
  }
}

/**
 * Generic helper to update a single boolean setting on the creator profile.
 */
async function updateProfileBooleanSetting(
  key: string,
  value: boolean,
  label: string
): Promise<void> {
  noStore();

  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean`);
  }

  try {
    const { userId } = await getCachedAuth();
    if (!userId) throw new Error('Unauthorized');

    const profile = await runAtomicDbOperation(
      async tx => {
        const selected = await getActiveWritableProfile(tx, userId);
        if (!selected) throw new TypeError('Profile not found');
        const currentSettings = (selected.settings ?? {}) as Record<
          string,
          unknown
        >;
        const [updated] = await tx
          .update(creatorProfiles)
          .set({
            settings: { ...currentSettings, [key]: value },
            profileEditVersion: drizzleSql`${creatorProfiles.profileEditVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(creatorProfiles.id, selected.id),
              writableProfileForUser(userId),
              exists(
                tx
                  .select({ id: users.id })
                  .from(users)
                  .where(appUserIdFilter(userId))
              )
            )
          )
          .returning({ id: creatorProfiles.id });
        if (!updated) throw new TypeError('Profile not found or unauthorized');
        return selected;
      },
      { actorId: userId, retry: 'never' }
    );

    if (profile.usernameNormalized) {
      await invalidateProfileCache(profile.usernameNormalized);
    }
  } catch (error) {
    if (!isExpectedProfileActionError(error)) {
      await captureError(`${label} failed`, error, {
        route: 'dashboard/actions/creator-profile',
      });
    }
    throw error;
  }
}

export async function updateAllowProfilePhotoDownloads(
  allowDownloads: boolean
): Promise<void> {
  return updateProfileBooleanSetting(
    'allowProfilePhotoDownloads',
    allowDownloads,
    'updateAllowProfilePhotoDownloads'
  );
}

/**
 * Update the "show old releases" setting for a creator profile.
 * When false (default), releases older than 90 days are hidden from the
 * public profile card. Setting to true keeps them visible.
 */
export async function updateShowOldReleases(
  showOldReleases: boolean
): Promise<void> {
  return updateProfileBooleanSetting(
    'showOldReleases',
    showOldReleases,
    'updateShowOldReleases'
  );
}
