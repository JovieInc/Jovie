import 'server-only';

import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN } from '@/lib/utils/email';
import { buildSignupWaitlistEntryValues } from '@/lib/waitlist/signup-entry';

/** A gated customer should hear back within this window (Ovie review SLA). */
export const PENDING_REVIEW_SLA_DAYS = 3;

export interface WaitlistAdmissionReport {
  /** Pending users found without a waitlist entry; each now has one. */
  readonly healedMissingEntries: number;
  /** External pending users waiting longer than the review SLA. */
  readonly stalePending: number;
}

const hasNoCanonicalEntry = drizzleSql`not exists (
  select 1 from ${waitlistEntries}
  where ${waitlistEntries.canonical} = true
    and ${waitlistEntries.emailNormalized} = lower(trim(${users.email}))
)`;

/**
 * Admission detector (EVENT 2026-10-03, JOV-7701). Two invariants:
 * 1. Every `waitlist_pending` user has a waitlist entry. Provisioning creates
 *    it; a miss means that path regressed. The detector heals the miss and
 *    reports it, so the account reaches review instead of being stranded.
 * 2. No external customer waits in `waitlist_pending` beyond the review SLA.
 */
export async function reconcileWaitlistAdmission(
  now = new Date()
): Promise<WaitlistAdmissionReport> {
  const missing = await db
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.userStatus, 'waitlist_pending'),
        isNull(users.deletedAt),
        drizzleSql`${users.email} is not null`,
        hasNoCanonicalEntry
      )
    );

  const emails = [
    ...new Set(
      missing
        .map(row => row.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email))
    ),
  ];
  if (emails.length > 0) {
    await db
      .insert(waitlistEntries)
      .values(emails.map(email => buildSignupWaitlistEntryValues(email, now)))
      .onConflictDoNothing({
        target: waitlistEntries.emailNormalized,
        where: drizzleSql`${waitlistEntries.canonical} = true`,
      });
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
        drizzleSql`${users.createdAt} < ${cutoff}`,
        drizzleSql`lower(coalesce(${users.email}, '')) !~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN}`
      )
    );

  return {
    healedMissingEntries: emails.length,
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
      `${report.healedMissingEntries} waitlist_pending user(s) had no waitlist entry (healed; provisioning regressed)`
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
