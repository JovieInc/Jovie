import 'server-only';

import { and, eq } from 'drizzle-orm';
import { getWaitlistAccess } from '@/lib/auth/gate';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  DEFAULT_TEST_AVATAR_URL,
  ensureCreatorProfileRecord,
  ensureUserProfileClaim,
  setActiveProfileForUser,
} from '@/lib/testing/test-user-provision.server';
import {
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
  type WaitlistApprovalResult,
} from '@/lib/waitlist/approval';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

export type DevUnwaitlistResult =
  | {
      readonly ok: true;
      readonly profileId: string | null;
      readonly message: string;
      readonly waitlistStatus: string | null;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly status: 404 | 422;
    };

function devUsernameFromEmail(email: string): string {
  const local =
    email
      .split('@')[0]
      ?.replaceAll(/[^a-z0-9]/gi, '')
      .slice(0, 24) ?? 'user';
  return `dev-${local || 'user'}`.toLowerCase();
}

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim();
  if (!local) return 'Dev Artist';
  return local.replaceAll(/[._+-]/g, ' ').trim() || 'Dev Artist';
}

async function resolveWaitlistEntryId(
  email: string,
  userWaitlistEntryId: string | null
): Promise<string | null> {
  const waitlistAccess = await getWaitlistAccess(email);
  return waitlistAccess.entryId ?? userWaitlistEntryId;
}

async function resolveProfileId(params: {
  readonly userId: string;
  readonly activeProfileId: string | null;
  readonly waitlistEntryId: string | null;
}): Promise<string | null> {
  if (params.activeProfileId) {
    return params.activeProfileId;
  }

  if (params.waitlistEntryId) {
    const [waitlistProfile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.waitlistEntryId, params.waitlistEntryId))
      .limit(1);
    if (waitlistProfile) {
      return waitlistProfile.id;
    }
  }

  const [claimedProfile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.userId, params.userId),
        eq(creatorProfiles.isClaimed, true)
      )
    )
    .limit(1);

  return claimedProfile?.id ?? null;
}

async function approvePendingWaitlistEntry(
  entryId: string,
  waitlistStatus: string | null
): Promise<WaitlistApprovalResult | null> {
  if (!isWaitlistPendingStatus(waitlistStatus)) {
    return null;
  }

  return withSystemIngestionSession(
    async tx => approveWaitlistEntryInTx(tx, entryId),
    { isolationLevel: 'serializable' }
  );
}

async function finalizeDevSessionActivation(params: {
  readonly userId: string;
  readonly email: string;
  readonly clerkId: string | null;
  readonly userName: string | null;
  readonly waitlistEntryId: string | null;
  readonly activeProfileId: string | null;
}): Promise<{ profileId: string | null }> {
  const now = new Date();
  let profileId = await resolveProfileId({
    userId: params.userId,
    activeProfileId: params.activeProfileId,
    waitlistEntryId: params.waitlistEntryId,
  });

  const username = devUsernameFromEmail(params.email);
  const displayName =
    params.userName?.trim() || displayNameFromEmail(params.email);

  if (!profileId) {
    profileId = await ensureCreatorProfileRecord(db, {
      userId: params.userId,
      creatorType: 'artist',
      username,
      usernameNormalized: username.toLowerCase(),
      displayName,
      bio: null,
      venmoHandle: null,
      avatarUrl: DEFAULT_TEST_AVATAR_URL,
      spotifyUrl: null,
      appleMusicUrl: null,
      appleMusicId: null,
      youtubeMusicId: null,
      deezerId: null,
      tidalId: null,
      soundcloudId: null,
      isPublic: true,
      isVerified: false,
      isClaimed: true,
      ingestionStatus: 'idle',
      onboardingCompletedAt: now,
    });
  } else {
    const [existingProfile] = await db
      .select({
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    await db
      .update(creatorProfiles)
      .set({
        userId: params.userId,
        username: existingProfile?.username?.trim() || username,
        usernameNormalized:
          existingProfile?.usernameNormalized?.trim() || username.toLowerCase(),
        displayName: existingProfile?.displayName?.trim() || displayName,
        isClaimed: true,
        isPublic: true,
        claimedAt: now,
        onboardingCompletedAt: now,
        updatedAt: now,
      })
      .where(eq(creatorProfiles.id, profileId));
  }

  await ensureUserProfileClaim(db, params.userId, profileId);
  await setActiveProfileForUser(db, params.userId, profileId);

  await db
    .update(users)
    .set({
      userStatus: 'active',
      activeProfileId: profileId,
      ...(params.waitlistEntryId
        ? { waitlistEntryId: params.waitlistEntryId }
        : {}),
      updatedAt: now,
    })
    .where(eq(users.id, params.userId));

  if (params.waitlistEntryId) {
    await db
      .update(waitlistEntries)
      .set({
        status: 'claimed',
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, params.waitlistEntryId));
  }

  if (params.clerkId) {
    await invalidateProxyUserStateCache(params.clerkId);
  }

  return { profileId };
}

/**
 * Dev-only activation for the authenticated session user.
 * Approves any pending waitlist entry, then marks the profile claimed/public
 * with onboarding completed so native-auth smoke can proceed without manual DB edits.
 */
export async function devUnwaitlistSessionUser(params: {
  readonly userId: string;
  readonly email: string;
  readonly clerkId: string | null;
}): Promise<DevUnwaitlistResult> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      userStatus: users.userStatus,
      waitlistEntryId: users.waitlistEntryId,
      activeProfileId: users.activeProfileId,
      clerkId: users.clerkId,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user) {
    return {
      ok: false,
      error: 'User record not found',
      status: 404,
    };
  }

  const waitlistAccess = await getWaitlistAccess(params.email);
  const entryId = await resolveWaitlistEntryId(
    params.email,
    user.waitlistEntryId
  );

  if (user.userStatus === 'active') {
    const { profileId } = await finalizeDevSessionActivation({
      userId: user.id,
      email: params.email,
      clerkId: params.clerkId ?? user.clerkId,
      userName: user.name,
      waitlistEntryId: entryId,
      activeProfileId: user.activeProfileId,
    });

    return {
      ok: true,
      profileId,
      message: 'Session user already active — profile refreshed for dev QA',
      waitlistStatus: waitlistAccess.status,
    };
  }

  let approvalResult: WaitlistApprovalResult | null = null;
  if (entryId) {
    approvalResult = await approvePendingWaitlistEntry(
      entryId,
      waitlistAccess.status
    );

    if (approvalResult?.outcome === 'no_user') {
      return {
        ok: false,
        error: 'Waitlist entry exists but no app user is linked yet',
        status: 422,
      };
    }

    if (
      approvalResult &&
      approvalResult.outcome !== 'approved' &&
      approvalResult.outcome !== 'already_processed'
    ) {
      return {
        ok: false,
        error: `Unexpected waitlist outcome: ${approvalResult.outcome}`,
        status: 422,
      };
    }

    if (approvalResult) {
      await finalizeWaitlistApproval(approvalResult);
    }
  }

  const { profileId } = await finalizeDevSessionActivation({
    userId: user.id,
    email: params.email,
    clerkId: params.clerkId ?? user.clerkId,
    userName: user.name,
    waitlistEntryId: entryId,
    activeProfileId: user.activeProfileId,
  });

  return {
    ok: true,
    profileId,
    message: 'Session user activated past waitlist for dev QA',
    waitlistStatus: waitlistAccess.status,
  };
}
