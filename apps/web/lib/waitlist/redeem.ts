import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { withSerializableRetry } from '@/lib/db/serializable-retry';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { normalizeEmail } from '@/lib/utils/email';
import { insertWaitlistAuditLog } from '@/lib/waitlist/audit';
import { isWaitlistInviteRedeemableStatus } from '@/lib/waitlist/state-machine';
import { isStatusUpgrade } from '@/lib/waitlist/status-precedence';
import { hashWaitlistInviteToken } from '@/lib/waitlist/tokens';

export type WaitlistInviteRedeemResult =
  | { outcome: 'invalid' }
  | { outcome: 'expired'; entryId: string }
  | { outcome: 'email_mismatch'; entryId: string }
  | { outcome: 'signed_up'; entryId: string }
  | { outcome: 'approved'; entryId: string; clerkId: string };

async function upsertApprovedUser(params: {
  tx: DbOrTransaction;
  clerkUserId: string;
  email: string;
  entryId: string;
}) {
  const [existing] = await params.tx
    .select({ id: users.id, userStatus: users.userStatus })
    .from(users)
    .where(eq(users.clerkId, params.clerkUserId))
    .for('update')
    .limit(1);

  if (!existing) {
    await params.tx.insert(users).values({
      clerkId: params.clerkUserId,
      email: params.email,
      userStatus: 'waitlist_approved',
      waitlistEntryId: params.entryId,
    });
    return;
  }

  const nextStatus = isStatusUpgrade(existing.userStatus, 'waitlist_approved')
    ? 'waitlist_approved'
    : existing.userStatus;

  await params.tx
    .update(users)
    .set({
      email: params.email,
      userStatus: nextStatus,
      waitlistEntryId: params.entryId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));
}

async function hasLinkedApprovedUser(params: {
  tx: DbOrTransaction;
  clerkUserId: string;
  entryId: string;
}): Promise<boolean> {
  const [existing] = await params.tx
    .select({
      waitlistEntryId: users.waitlistEntryId,
      userStatus: users.userStatus,
    })
    .from(users)
    .where(eq(users.clerkId, params.clerkUserId))
    .for('update')
    .limit(1);

  if (!existing || existing.waitlistEntryId !== params.entryId) {
    return false;
  }

  return (
    existing.userStatus === 'waitlist_approved' ||
    existing.userStatus === 'profile_claimed' ||
    existing.userStatus === 'onboarding_incomplete' ||
    existing.userStatus === 'active'
  );
}

export async function redeemWaitlistInviteToken(input: {
  token: string;
  clerkUserId: string;
  verifiedEmail?: string;
  verifiedEmails?: readonly string[];
}): Promise<WaitlistInviteRedeemResult> {
  const verifiedEmails = [
    ...(input.verifiedEmails ?? []),
    ...(input.verifiedEmail ? [input.verifiedEmail] : []),
  ];
  const normalizedEmails = new Map(
    verifiedEmails.map(email => [normalizeEmail(email), email] as const)
  );
  const tokenHash = hashWaitlistInviteToken(input.token);

  const result = await withSerializableRetry(() =>
    withSystemIngestionSession(
      async tx => {
        const now = new Date();
        const [entry] = await tx
          .select({
            id: waitlistEntries.id,
            email: waitlistEntries.email,
            emailNormalized: waitlistEntries.emailNormalized,
            status: waitlistEntries.status,
            inviteTokenExpiresAt: waitlistEntries.inviteTokenExpiresAt,
            inviteTokenRedeemedAt: waitlistEntries.inviteTokenRedeemedAt,
          })
          .from(waitlistEntries)
          .where(eq(waitlistEntries.inviteTokenHash, tokenHash))
          .for('update')
          .limit(1);

        if (!entry) return { outcome: 'invalid' as const };

        const entryEmail = entry.emailNormalized || normalizeEmail(entry.email);
        const matchedVerifiedEmail = normalizedEmails.get(entryEmail);
        if (!matchedVerifiedEmail) {
          return { outcome: 'email_mismatch' as const, entryId: entry.id };
        }

        if (entry.status === 'signed_up' || entry.status === 'claimed') {
          return { outcome: 'signed_up' as const, entryId: entry.id };
        }

        if (entry.status === 'expired') {
          return { outcome: 'expired' as const, entryId: entry.id };
        }

        if (!isWaitlistInviteRedeemableStatus(entry.status)) {
          return { outcome: 'invalid' as const };
        }

        if (entry.inviteTokenRedeemedAt) {
          if (
            entry.status !== 'approved' ||
            !entry.inviteTokenExpiresAt ||
            entry.inviteTokenExpiresAt.getTime() <= now.getTime()
          ) {
            return { outcome: 'invalid' as const };
          }

          const linkedApprovedUser = await hasLinkedApprovedUser({
            tx,
            clerkUserId: input.clerkUserId,
            entryId: entry.id,
          });

          if (!linkedApprovedUser) {
            return { outcome: 'invalid' as const };
          }

          return {
            outcome: 'approved' as const,
            entryId: entry.id,
            clerkId: input.clerkUserId,
          };
        }

        if (
          !entry.inviteTokenExpiresAt ||
          entry.inviteTokenExpiresAt.getTime() <= now.getTime()
        ) {
          await tx
            .update(waitlistEntries)
            .set({
              status: 'expired',
              expiredAt: now,
              statusReason: 'invite_expired',
              updatedAt: now,
            })
            .where(
              and(
                eq(waitlistEntries.id, entry.id),
                drizzleSql`${waitlistEntries.status} <> 'signed_up'`
              )
            );
          await insertWaitlistAuditLog(tx, {
            waitlistEntryId: entry.id,
            fromStatus: entry.status,
            toStatus: 'expired',
            actorType: 'system',
            reason: 'invite_expired',
          });
          return { outcome: 'expired' as const, entryId: entry.id };
        }

        await upsertApprovedUser({
          tx,
          clerkUserId: input.clerkUserId,
          email: matchedVerifiedEmail,
          entryId: entry.id,
        });

        await tx
          .update(waitlistEntries)
          .set({
            status: 'approved',
            approvedAt: now,
            inviteTokenRedeemedAt: now,
            statusReason: 'invite_redeemed',
            updatedAt: now,
          })
          .where(eq(waitlistEntries.id, entry.id));

        await insertWaitlistAuditLog(tx, {
          waitlistEntryId: entry.id,
          fromStatus: entry.status,
          toStatus: 'approved',
          actorUserId: input.clerkUserId,
          actorType: 'user',
          reason: 'invite_redeemed',
        });

        return {
          outcome: 'approved' as const,
          entryId: entry.id,
          clerkId: input.clerkUserId,
        };
      },
      { isolationLevel: 'serializable' }
    )
  );

  if (result.outcome === 'approved') {
    await invalidateProxyUserStateCache(input.clerkUserId);
  }

  return result;
}
