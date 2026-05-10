import { and, sql as drizzleSql, eq, ne } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { insertWaitlistAuditLog } from '@/lib/waitlist/audit';
import {
  isWaitlistApprovedStatus,
  isWaitlistPendingStatus,
} from '@/lib/waitlist/state-machine';

export type WaitlistApprovalResult =
  | { outcome: 'not_found' }
  | { outcome: 'already_processed'; status: string }
  | { outcome: 'no_user' }
  | {
      outcome: 'approved';
      entryId: string;
      profileId: string | null;
      email: string;
      fullName: string;
      clerkId: string | null;
    };

export type WaitlistDisapprovalResult =
  | { outcome: 'not_found' }
  | { outcome: 'already_new' }
  | { outcome: 'terminal'; status: string }
  | { outcome: 'disapproved'; clerkId: string | null };

export async function approveWaitlistEntryInTx(
  tx: DbOrTransaction,
  entryId: string,
  options: {
    actorUserId?: string | null;
    actorType?: 'system' | 'admin' | 'job';
    reason?: string | null;
    targetStatus?: 'approved' | 'invited';
  } = {}
): Promise<WaitlistApprovalResult> {
  const now = new Date();

  const [entry] = await tx
    .select({
      id: waitlistEntries.id,
      email: waitlistEntries.email,
      fullName: waitlistEntries.fullName,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, entryId))
    .for('update')
    .limit(1);

  if (!entry) return { outcome: 'not_found' };

  if (entry.status === 'signed_up') {
    return { outcome: 'already_processed', status: entry.status };
  }

  const [user] = await tx
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(
      drizzleSql`lower(trim(${users.email})) = lower(trim(${entry.email}))`
    )
    .limit(1);

  if (!user) {
    return { outcome: 'no_user' };
  }

  if (isWaitlistApprovedStatus(entry.status)) {
    return {
      outcome: 'approved',
      entryId: entry.id,
      profileId: null,
      email: entry.email,
      fullName: entry.fullName,
      clerkId: user.clerkId,
    };
  }

  if (entry.status !== 'expired' && !isWaitlistPendingStatus(entry.status)) {
    return { outcome: 'already_processed', status: entry.status };
  }

  const [profile] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.waitlistEntryId, entry.id))
    .limit(1);

  if (profile) {
    const [existingClaimedProfile] = await tx
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.userId, user.id),
          eq(creatorProfiles.isClaimed, true),
          ne(creatorProfiles.id, profile.id)
        )
      )
      .for('update')
      .limit(1);

    if (existingClaimedProfile) {
      await tx
        .update(creatorProfiles)
        .set({
          userId: null,
          isClaimed: false,
          onboardingCompletedAt: null,
          updatedAt: now,
        })
        .where(eq(creatorProfiles.id, existingClaimedProfile.id));
    }

    await tx
      .update(creatorProfiles)
      .set({
        userId: user.id,
        isClaimed: true,
        isPublic: false,
        claimedAt: now,
        updatedAt: now,
      })
      .where(eq(creatorProfiles.id, profile.id));
  }

  const targetStatus = options.targetStatus ?? 'invited';

  await tx
    .update(waitlistEntries)
    .set({
      status: targetStatus,
      approvedAt: now,
      invitedAt: targetStatus === 'invited' ? now : null,
      expiredAt: null,
      inviteTokenRedeemedAt: null,
      adminActorId: options.actorUserId ?? null,
      statusReason: options.reason ?? 'approved',
      updatedAt: now,
    })
    .where(eq(waitlistEntries.id, entry.id));

  await insertWaitlistAuditLog(tx, {
    waitlistEntryId: entry.id,
    fromStatus: entry.status,
    toStatus: targetStatus,
    actorUserId: options.actorUserId ?? null,
    actorType: options.actorType ?? 'system',
    reason: options.reason ?? 'approved',
  });

  await tx
    .update(users)
    .set({
      userStatus: 'waitlist_approved',
      waitlistEntryId: entry.id,
      activeProfileId: profile?.id ?? null,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  return {
    outcome: 'approved',
    entryId: entry.id,
    profileId: profile?.id ?? null,
    email: entry.email,
    fullName: entry.fullName,
    clerkId: user.clerkId,
  };
}

export async function finalizeWaitlistApproval(result: WaitlistApprovalResult) {
  if (result.outcome === 'approved' && result.clerkId) {
    await invalidateProxyUserStateCache(result.clerkId);
  }
}

export async function disapproveWaitlistEntryInTx(
  tx: DbOrTransaction,
  entryId: string
): Promise<WaitlistDisapprovalResult> {
  const now = new Date();

  const [entry] = await tx
    .select({
      id: waitlistEntries.id,
      email: waitlistEntries.email,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, entryId))
    .for('update')
    .limit(1);

  if (!entry) return { outcome: 'not_found' };
  if (entry.status === 'signed_up' || entry.status === 'claimed') {
    return { outcome: 'terminal', status: entry.status };
  }
  if (entry.status === 'new' || entry.status === 'waitlisted') {
    return { outcome: 'already_new' };
  }

  const [user] = await tx
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(
      drizzleSql`lower(trim(${users.email})) = lower(trim(${entry.email}))`
    )
    .limit(1);

  const [profile] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.waitlistEntryId, entry.id))
    .limit(1);

  if (profile) {
    await tx
      .update(creatorProfiles)
      .set({
        userId: null,
        isClaimed: false,
        isPublic: false,
        onboardingCompletedAt: null,
        updatedAt: now,
      })
      .where(eq(creatorProfiles.id, profile.id));
  }

  await tx
    .update(waitlistEntries)
    .set({
      status: 'waitlisted',
      statusReason: 'approval_removed',
      waitlistedAt: now,
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
      inviteTokenRedeemedAt: null,
      inviteEmailStatus: null,
      inviteEmailProviderMessageId: null,
      inviteEmailLastError: null,
      inviteEmailSentAt: null,
      updatedAt: now,
    })
    .where(eq(waitlistEntries.id, entry.id));

  await insertWaitlistAuditLog(tx, {
    waitlistEntryId: entry.id,
    fromStatus: entry.status,
    toStatus: 'waitlisted',
    actorType: 'admin',
    reason: 'approval_removed',
  });

  if (user) {
    await tx
      .update(users)
      .set({
        userStatus: 'waitlist_pending',
        activeProfileId: profile ? null : undefined,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
  }

  return { outcome: 'disapproved', clerkId: user?.clerkId ?? null };
}

export async function finalizeWaitlistDisapproval(
  result: WaitlistDisapprovalResult
) {
  if (result.outcome === 'disapproved' && result.clerkId) {
    await invalidateProxyUserStateCache(result.clerkId);
  }
}
