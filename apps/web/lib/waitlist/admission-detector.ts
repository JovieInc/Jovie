import 'server-only';

import { and, sql as drizzleSql, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN } from '@/lib/utils/email';
import { buildSignupWaitlistEntryValues } from '@/lib/waitlist/signup-entry';

/** A gated customer should hear back within this window (Ovie review SLA). */
export const PENDING_REVIEW_SLA_DAYS = 3;

export interface WaitlistAdmissionReport {
  /** Missing pending/approved entries actually inserted by this run. */
  readonly healedMissingEntries: number;
  /** External pending users waiting longer than the review SLA. */
  readonly stalePending: number;
}

const hasNoEntry = drizzleSql`not exists (
  select 1 from ${waitlistEntries}
  where ${waitlistEntries.id} = ${users.waitlistEntryId}
    or (${waitlistEntries.canonical} = true and (
      ${waitlistEntries.emailNormalized} = lower(trim(${users.email}))
      or lower(trim(${waitlistEntries.email})) = lower(trim(${users.email}))
    ))
)`;

/**
 * Admission detector (EVENT 2026-10-03, JOV-7701). Two invariants:
 * 1. Pending and approved users have a waitlist entry. Heal legacy ingestion
 *    and gate-bypass misses while preserving the user's admission state.
 * 2. No external customer waits in `waitlist_pending` beyond the review SLA.
 */
export async function reconcileWaitlistAdmission(
  now = new Date()
): Promise<WaitlistAdmissionReport> {
  const missing = await db
    .select({ email: users.email, userStatus: users.userStatus })
    .from(users)
    .where(
      and(
        inArray(users.userStatus, ['waitlist_pending', 'waitlist_approved']),
        isNull(users.deletedAt),
        drizzleSql`nullif(trim(${users.email}), '') is not null`,
        hasNoEntry
      )
    );

  const entries = new Map<string, typeof waitlistEntries.$inferInsert>();
  for (const row of missing) {
    const email = row.email?.trim().toLowerCase();
    if (!email || entries.get(email)?.status === 'approved') continue;
    entries.set(email, {
      ...buildSignupWaitlistEntryValues(email, now),
      ...(row.userStatus === 'waitlist_approved'
        ? {
            status: 'approved',
            statusReason: 'legacy_user_approved',
            approvedAt: now,
            waitlistedAt: null,
          }
        : {}),
    });
  }
  let healedMissingEntries = 0;
  if (entries.size > 0) {
    const inserted = await db
      .insert(waitlistEntries)
      .values([...entries.values()])
      .onConflictDoNothing({
        target: waitlistEntries.emailNormalized,
        where: drizzleSql`${waitlistEntries.canonical} = true`,
      })
      .returning({ id: waitlistEntries.id });
    healedMissingEntries = inserted.length;
  }

  const cutoff = new Date(
    now.getTime() - PENDING_REVIEW_SLA_DAYS * 24 * 60 * 60 * 1000
  );
  const [stale] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.userStatus, 'waitlist_pending'),
        isNull(users.deletedAt),
        lt(users.createdAt, cutoff),
        drizzleSql`lower(coalesce(${users.email}, '')) !~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN}`
      )
    );

  return {
    healedMissingEntries,
    stalePending: Number(stale?.count ?? 0),
  };
}

/** Throws (so the cron reports it) when either invariant was violated. */
export function assertWaitlistAdmissionHealthy(
  report: WaitlistAdmissionReport
): WaitlistAdmissionReport {
  const problems: string[] = [];
  if (report.healedMissingEntries > 0) {
    problems.push(
      `${report.healedMissingEntries} pending/approved waitlist entry(s) were missing (healed; inspect ingestion or gate bypass)`
    );
  }
  if (report.stalePending > 0) {
    problems.push(
      `${report.stalePending} external user(s) pending longer than ${PENDING_REVIEW_SLA_DAYS} days; review them in the admin waitlist`
    );
  }
  if (problems.length > 0) throw new Error(problems.join('; '));
  return report;
}
