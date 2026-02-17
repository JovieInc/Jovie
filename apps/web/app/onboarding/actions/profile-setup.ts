/**
 * User and profile creation/update operations
 */

'use server';

import { sql as drizzleSql, eq } from 'drizzle-orm';
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
      .returning();

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
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

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
 */
export async function fetchExistingProfile(
  tx: DbTransaction,
  userId: string
): Promise<CreatorProfile | null> {
  try {
    const [existingProfile] = await tx
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    return existingProfile ?? null;
  } catch (error) {
    await captureError('fetchExistingProfile failed', error, {
      route: 'profile-setup',
    });
    throw error;
  }
}
