import 'server-only';

import { and, eq, ne } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  creatorProfiles,
  profileOwnershipLog,
  userProfileClaims,
} from '@/lib/db/schema/profiles';

type ClaimOperationSource =
  | 'token_backed_onboarding'
  | 'direct_profile_reserve'
  | 'direct_profile_spotify_match';

interface ClaimTargetProfile {
  readonly id: string;
  readonly userId: string | null;
  readonly usernameNormalized: string;
  readonly displayName: string | null;
  readonly isClaimed: boolean | null;
  readonly onboardingCompletedAt: Date | null;
}

async function getClaimTargetProfile(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<ClaimTargetProfile> {
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      isClaimed: creatorProfiles.isClaimed,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .for('update')
    .limit(1);

  if (!profile) {
    throw new Error('[CLAIM_NOT_FOUND] Profile not found');
  }

  return profile;
}

async function ensureNoClaimedProfileConflict(
  tx: DbOrTransaction,
  userId: string,
  creatorProfileId: string
): Promise<void> {
  const [existingClaim] = await tx
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.userId, userId),
        eq(creatorProfiles.isClaimed, true),
        ne(creatorProfiles.id, creatorProfileId)
      )
    )
    .for('update')
    .limit(1);

  if (existingClaim) {
    throw new Error(
      `[PROFILE_CONFLICT] You already own @${existingClaim.usernameNormalized}.`
    );
  }
}

async function releaseOtherReservedProfiles(
  tx: DbOrTransaction,
  userId: string,
  keepProfileId: string
): Promise<void> {
  await tx
    .update(creatorProfiles)
    .set({
      userId: null,
      onboardingCompletedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creatorProfiles.userId, userId),
        eq(creatorProfiles.isClaimed, false),
        ne(creatorProfiles.id, keepProfileId)
      )
    );
}

async function upsertUserActiveProfile(
  tx: DbOrTransaction,
  userId: string,
  profileId: string
): Promise<void> {
  await tx
    .update(users)
    .set({
      activeProfileId: profileId,
      userStatus: 'onboarding_incomplete',
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function ensureOnboardingUserRow(
  tx: DbOrTransaction,
  params: {
    clerkUserId: string;
    userEmail: string | null;
  }
): Promise<{ id: string }> {
  const now = new Date();
  const [user] = await tx
    .insert(users)
    .values({
      clerkId: params.clerkUserId,
      email: params.userEmail,
      userStatus: 'onboarding_incomplete',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        ...(params.userEmail ? { email: params.userEmail } : {}),
        userStatus: 'onboarding_incomplete',
        updatedAt: now,
      },
    })
    .returning({ id: users.id });

  if (!user) {
    throw new Error('[DATABASE_ERROR] Failed to provision user row');
  }

  return user;
}

export async function reservePrebuiltProfileForUser(
  tx: DbOrTransaction,
  params: {
    userId: string;
    creatorProfileId: string;
    expectedUsername: string;
    displayName: string;
  }
): Promise<{ profileId: string; username: string; status: 'updated' }> {
  const profile = await getClaimTargetProfile(tx, params.creatorProfileId);
  const expectedUsername = params.expectedUsername.toLowerCase();

  if (profile.usernameNormalized !== expectedUsername) {
    throw new Error('[CLAIM_NOT_FOUND] Claim context is out of date');
  }

  await ensureNoClaimedProfileConflict(tx, params.userId, profile.id);

  if (profile.userId && profile.userId !== params.userId) {
    throw new Error('[PROFILE_CONFLICT] This profile is no longer available.');
  }

  if (profile.isClaimed && profile.userId !== params.userId) {
    throw new Error(
      '[PROFILE_CONFLICT] This profile has already been claimed.'
    );
  }

  await releaseOtherReservedProfiles(tx, params.userId, profile.id);

  await tx
    .update(creatorProfiles)
    .set({
      userId: params.userId,
      displayName: params.displayName,
      isPublic: true,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id));

  await upsertUserActiveProfile(tx, params.userId, profile.id);

  return {
    profileId: profile.id,
    username: expectedUsername,
    status: 'updated',
  };
}

export async function claimPrebuiltProfileForUser(
  tx: DbOrTransaction,
  params: {
    userId: string;
    creatorProfileId: string;
    expectedUsername: string;
    displayName: string;
    source: ClaimOperationSource;
    finalizeOnboarding?: boolean;
  }
): Promise<{ profileId: string; username: string; status: 'updated' }> {
  const profile = await getClaimTargetProfile(tx, params.creatorProfileId);
  const expectedUsername = params.expectedUsername.toLowerCase();
  const now = new Date();

  if (profile.usernameNormalized !== expectedUsername) {
    throw new Error('[CLAIM_NOT_FOUND] Claim context is out of date');
  }

  await ensureNoClaimedProfileConflict(tx, params.userId, profile.id);

  if (profile.userId && profile.userId !== params.userId) {
    throw new Error('[PROFILE_CONFLICT] This profile is no longer available.');
  }

  if (profile.isClaimed && profile.userId !== params.userId) {
    throw new Error(
      '[PROFILE_CONFLICT] This profile has already been claimed.'
    );
  }

  await releaseOtherReservedProfiles(tx, params.userId, profile.id);

  await tx
    .update(creatorProfiles)
    .set({
      userId: params.userId,
      displayName: params.displayName,
      isClaimed: true,
      isPublic: true,
      claimedAt: now,
      onboardingCompletedAt: params.finalizeOnboarding
        ? (profile.onboardingCompletedAt ?? now)
        : profile.onboardingCompletedAt,
      updatedAt: now,
    })
    .where(eq(creatorProfiles.id, profile.id));

  await tx
    .insert(userProfileClaims)
    .values({
      userId: params.userId,
      creatorProfileId: profile.id,
      role: 'owner',
      claimedAt: now,
    })
    .onConflictDoNothing();

  await tx.insert(profileOwnershipLog).values({
    creatorProfileId: profile.id,
    userId: params.userId,
    performedBy: params.userId,
    action: 'claimed',
    reason: params.source,
  });

  await tx
    .update(users)
    .set({
      activeProfileId: profile.id,
      userStatus: params.finalizeOnboarding
        ? 'active'
        : 'onboarding_incomplete',
      updatedAt: now,
    })
    .where(eq(users.id, params.userId));

  return {
    profileId: profile.id,
    username: expectedUsername,
    status: 'updated',
  };
}
