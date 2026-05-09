import 'server-only';

import {
  and,
  asc,
  sql as drizzleSql,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { emailSuppressions } from '@/lib/db/schema/suppression';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { withSerializableRetry } from '@/lib/db/serializable-retry';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { hashEmail } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';
import {
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
} from '@/lib/waitlist/approval';
import { enqueueWaitlistApprovalInviteEmail } from '@/lib/waitlist/email-jobs';
import {
  getWaitlistSettings,
  tryReserveAutoAcceptSlot,
} from '@/lib/waitlist/settings';

const AUTO_ACCEPT_ELIGIBLE_STATUSES = ['new', 'waitlisted'] as const;

export interface WaitlistAutoAcceptResult {
  enabled: boolean;
  scanned: number;
  approved: number;
  skipped: number;
  failed: number;
  capacityRemaining: number;
}

function getCutoffDate(days: number, now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, Math.trunc(days)));
  return cutoff;
}

async function getSuppressedEmailHashes(emails: string[], now: Date) {
  const hashes = Array.from(new Set(emails.map(email => hashEmail(email))));

  if (hashes.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({ emailHash: emailSuppressions.emailHash })
    .from(emailSuppressions)
    .where(
      and(
        inArray(emailSuppressions.emailHash, hashes),
        or(
          isNull(emailSuppressions.expiresAt),
          gt(emailSuppressions.expiresAt, now)
        )
      )
    );

  return new Set(rows.map(row => row.emailHash));
}

async function getBlockedExistingUserEmails(emails: string[]) {
  const normalizedEmails = Array.from(
    new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean))
  );

  if (normalizedEmails.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({
      email: users.email,
      userStatus: users.userStatus,
    })
    .from(users)
    .where(
      inArray(drizzleSql<string>`lower(${users.email})`, normalizedEmails)
    );

  return new Set(
    rows
      .filter(
        row =>
          row.email &&
          (row.userStatus === 'banned' ||
            row.userStatus === 'suspended' ||
            row.userStatus === 'active')
      )
      .map(row => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  );
}

export async function runWaitlistAutoAccept(
  options: { now?: Date; maxCandidates?: number } = {}
): Promise<WaitlistAutoAcceptResult> {
  const now = options.now ?? new Date();
  const settings = await getWaitlistSettings();
  const capacityRemaining = Math.max(
    0,
    settings.autoAcceptDailyLimit - settings.autoAcceptedToday
  );

  if (
    !settings.autoAcceptEnabled ||
    settings.autoAcceptDailyLimit <= 0 ||
    capacityRemaining <= 0
  ) {
    return {
      enabled: settings.autoAcceptEnabled,
      scanned: 0,
      approved: 0,
      skipped: 0,
      failed: 0,
      capacityRemaining,
    };
  }

  const cutoff = getCutoffDate(settings.autoAcceptAfterDays, now);
  const limit = Math.min(options.maxCandidates ?? 10_000, 10_000);

  const candidates = await db
    .select({
      id: waitlistEntries.id,
      email: waitlistEntries.email,
    })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.canonical, true),
        inArray(waitlistEntries.status, AUTO_ACCEPT_ELIGIBLE_STATUSES),
        lte(waitlistEntries.waitlistedAt, cutoff)
      )
    )
    .orderBy(asc(waitlistEntries.waitlistedAt), asc(waitlistEntries.createdAt))
    .limit(limit);

  let approved = 0;
  let skipped = 0;
  let failed = 0;
  const candidateEmails = candidates.map(candidate => candidate.email);
  const [suppressedEmailHashes, blockedUserEmails] = await Promise.all([
    getSuppressedEmailHashes(candidateEmails, now),
    getBlockedExistingUserEmails(candidateEmails),
  ]);

  for (const candidate of candidates) {
    const normalizedEmail = candidate.email.trim().toLowerCase();
    if (
      suppressedEmailHashes.has(hashEmail(candidate.email)) ||
      blockedUserEmails.has(normalizedEmail)
    ) {
      skipped += 1;
      continue;
    }

    try {
      const approval = await withSerializableRetry(() =>
        withSystemIngestionSession(
          async tx => {
            const [lockedCandidate] = await tx
              .select({
                id: waitlistEntries.id,
                email: waitlistEntries.email,
                status: waitlistEntries.status,
              })
              .from(waitlistEntries)
              .where(eq(waitlistEntries.id, candidate.id))
              .for('update')
              .limit(1);

            if (
              !lockedCandidate ||
              !AUTO_ACCEPT_ELIGIBLE_STATUSES.includes(
                lockedCandidate.status as (typeof AUTO_ACCEPT_ELIGIBLE_STATUSES)[number]
              )
            ) {
              return { outcome: 'skipped' as const };
            }

            const [user] = await tx
              .select({ id: users.id, userStatus: users.userStatus })
              .from(users)
              .where(
                drizzleSql`lower(${users.email}) = lower(${lockedCandidate.email})`
              )
              .for('update')
              .limit(1);

            if (
              !user ||
              user.userStatus === 'banned' ||
              user.userStatus === 'suspended' ||
              user.userStatus === 'active'
            ) {
              return { outcome: 'skipped' as const };
            }

            const reservation = await tryReserveAutoAcceptSlot(tx);
            if (!reservation.shouldAutoAccept) {
              return { outcome: 'capacity_full' as const };
            }

            const result = await approveWaitlistEntryInTx(tx, candidate.id, {
              actorType: 'job',
              reason: 'auto_accept_after_days',
              targetStatus: 'invited',
            });

            if (result.outcome === 'approved') {
              await enqueueWaitlistApprovalInviteEmail(tx, result.entryId, {
                now,
              });
            }

            return result;
          },
          { isolationLevel: 'serializable' }
        )
      );

      if (approval.outcome === 'capacity_full') {
        break;
      }

      if (approval.outcome === 'approved') {
        approved += 1;
        await finalizeWaitlistApproval(approval);
      } else {
        skipped += 1;
      }
    } catch (error) {
      failed += 1;
      logger.warn('[waitlist] Auto-accept candidate failed', {
        entryId: candidate.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    enabled: settings.autoAcceptEnabled,
    scanned: candidates.length,
    approved,
    skipped,
    failed,
    capacityRemaining: Math.max(0, capacityRemaining - approved),
  };
}
