/**
 * User and profile creation/update operations
 */

'use server';

import { and, desc, sql as drizzleSql, eq, not } from 'drizzle-orm';
import type { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import type { CompletionResult, CreatorProfile } from './types';

type DbTransaction = Parameters<Parameters<typeof withDbSessionTx>[0]>[0];

/**
 * Creates a new user and profile using the stored database function.
 */
export async function createUserAndProfile(
  tx: DbTransaction,
  clerkUserId: string,
  userEmail: string | null,
  normalizedUsername: string,
  trimmedDisplayName: string
): Promise<CompletionResult> {
  try {
    const createUserAndProfileTimer = 'db:onboarding:createUserAndProfile';
    console.time(createUserAndProfileTimer);
    const result = await tx.execute(
      drizzleSql<{ profile_id: string }>`
        SELECT create_profile_with_user(
          ${clerkUserId},
          ${userEmail ?? null},
          ${normalizedUsername},
          ${trimmedDisplayName}
        ) AS profile_id
      `
    );
    console.timeEnd(createUserAndProfileTimer);

    const profileId = result.rows?.[0]?.profile_id
      ? String(result.rows[0].profile_id)
      : null;

    return {
      username: normalizedUsername,
      status: 'created',
      profileId,
    };
  } catch (error) {
    await captureError('createUserAndProfile failed', error, {
      route: 'profile-setup',
    });
    throw error;
  }
}

/**
 * Creates a profile for an already-existing user row.
 */
export async function createProfileForExistingUser(
  tx: DbTransaction,
  userId: string,
  normalizedUsername: string,
  trimmedDisplayName: string
): Promise<CompletionResult> {
  try {
    const createProfileTimer = 'db:onboarding:createProfileForExistingUser';
    console.time(createProfileTimer);
    const [profile] = await tx
      .insert(creatorProfiles)
      .values({
        userId,
        creatorType: 'creator',
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
      .returning({
        id: creatorProfiles.id,
        usernameNormalized: creatorProfiles.usernameNormalized,
      });
    console.timeEnd(createProfileTimer);

    return {
      username: profile?.usernameNormalized || normalizedUsername,
      status: 'created',
      profileId: profile?.id ?? null,
    };
  } catch (error) {
    await captureError('createProfileForExistingUser failed', error, {
      route: 'profile-setup',
    });
    throw error;
  }
}

/**
 * Updates an existing profile with new onboarding data.
 */
export async function updateExistingProfile(
  tx: DbTransaction,
  profile: CreatorProfile,
  normalizedUsername: string,
  trimmedDisplayName: string,
  username: string
): Promise<CompletionResult> {
  try {
    const nextDisplayName =
      trimmedDisplayName || profile.displayName || username;

    const updateProfileTimer = 'db:onboarding:updateExistingProfile';
    console.time(updateProfileTimer);
    const [updated] = await tx
      .update(creatorProfiles)
      .set({
        username: normalizedUsername,
        usernameNormalized: normalizedUsername,
        displayName: nextDisplayName,
        onboardingCompletedAt: profile.onboardingCompletedAt ?? new Date(),
        isPublic: true,
        isClaimed: true,
        claimedAt: profile.claimedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id))
      .returning({
        usernameNormalized: creatorProfiles.usernameNormalized,
      });
    console.timeEnd(updateProfileTimer);

    return {
      username: updated?.usernameNormalized || normalizedUsername,
      status: 'updated',
      profileId: profile.id,
    };
  } catch (error) {
    await captureError('updateExistingProfile failed', error, {
      route: 'profile-setup',
    });
    throw error;
  }
}

/**
 * Fetches an existing user record by Clerk ID.
 */
export async function fetchExistingUser(
  tx: DbTransaction,
  clerkUserId: string
): Promise<{ id: string } | null> {
  try {
    const fetchUserTimer = 'db:onboarding:fetchExistingUser';
    console.time(fetchUserTimer);
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);
    console.timeEnd(fetchUserTimer);

    return existingUser ?? null;
  } catch (error) {
    await captureError('fetchExistingUser failed', error, {
      route: 'profile-setup',
    });
    throw error;
  }
}

/**
 * Fetches an existing profile for a user.
 * Prefers claimed profiles to avoid operating on unclaimed pre-populated profiles
 * when a claimed profile already exists.
 */
export async function fetchExistingProfile(
  tx: DbTransaction,
  userId: string
): Promise<CreatorProfile | null> {
  try {
    const fetchProfileTimer = 'db:onboarding:fetchExistingProfile';
    console.time(fetchProfileTimer);
    const [existingProfile] = await tx
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .orderBy(
        desc(creatorProfiles.isClaimed),
        desc(creatorProfiles.onboardingCompletedAt)
      )
      .limit(1);
    console.timeEnd(fetchProfileTimer);

    return existingProfile ?? null;
  } catch (error) {
    await captureError('fetchExistingProfile failed', error, {
      route: 'profile-setup',
    });
    throw error;
  }
}

/**
 * Deactivates orphaned unclaimed profiles for a user.
 * Called after a handle change to prevent stale public profiles from
 * remaining visible at old URLs.
 */
export async function deactivateOrphanedProfiles(
  tx: DbTransaction,
  userId: string,
  excludeProfileId: string
): Promise<void> {
  await tx
    .update(creatorProfiles)
    .set({ isPublic: false, updatedAt: new Date() })
    .where(
      and(
        eq(creatorProfiles.userId, userId),
        eq(creatorProfiles.isClaimed, false),
        not(eq(creatorProfiles.id, excludeProfileId))
      )
    );
}
