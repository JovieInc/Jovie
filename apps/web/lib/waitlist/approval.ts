import { sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';

export type WaitlistApprovalResult =
  | { outcome: 'not_found' }
  | { outcome: 'already_processed'; status: string }
  | { outcome: 'no_profile' }
  | { outcome: 'no_user' }
  | {
      outcome: 'approved';
      profileId: string;
      email: string;
      fullName: string;
      clerkId: string | null;
    };

export type WaitlistDisapprovalResult =
  | { outcome: 'not_found' }
  | { outcome: 'already_new' }
  | { outcome: 'disapproved'; clerkId: string | null };

export async function approveWaitlistEntryInTx(
  tx: DbOrTransaction,
  entryId: string
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

  if (entry.status !== 'new') {
    return { outcome: 'already_processed', status: entry.status };
  }

  const [profile] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.waitlistEntryId, entry.id))
    .limit(1);

  if (!profile) {
    return { outcome: 'no_profile' };
  }

  const [user] = await tx
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(drizzleSql`lower(${users.email}) = lower(${entry.email})`)
    .limit(1);

  if (!user) {
    return { outcome: 'no_user' };
  }

  await tx
    .update(creatorProfiles)
    .set({
      userId: user.id,
      isClaimed: true,
      isPublic: true,
      onboardingCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(creatorProfiles.id, profile.id));

  await tx
    .update(waitlistEntries)
    .set({ status: 'claimed', updatedAt: now })
    .where(eq(waitlistEntries.id, entry.id));

  await tx
    .update(users)
    .set({ userStatus: 'active', updatedAt: now })
    .where(eq(users.id, user.id));

  return {
    outcome: 'approved',
    profileId: profile.id,
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
  if (entry.status === 'new') return { outcome: 'already_new' };

  const [user] = await tx
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(drizzleSql`lower(${users.email}) = lower(${entry.email})`)
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
    .set({ status: 'new', updatedAt: now })
    .where(eq(waitlistEntries.id, entry.id));

  if (user) {
    await tx
      .update(users)
      .set({ userStatus: 'waitlist_pending', updatedAt: now })
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
