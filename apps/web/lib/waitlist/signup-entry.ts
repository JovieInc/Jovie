import 'server-only';

import { createHash } from 'node:crypto';
import { sql as drizzleSql } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureError } from '@/lib/error-tracking';
import { normalizeEmail } from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

/**
 * Source of the waitlist entry every gated sign-up gets at provisioning
 * (EVENT 2026-10-03 on JOV-7701). Before this, a sign-up that abandoned the
 * intake chat sat in `waitlist_pending` with no entry, invisible to review and
 * to auto-accept, and could never be admitted.
 */
export const SIGNUP_WAITLIST_SOURCE = 'signup' as const;

export function hashEmailForWaitlist(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

/**
 * A sign-up entry the intake chat has not qualified yet. The chat treats it
 * as a fresh request (full qualification) rather than a resubmission.
 */
export function isUnqualifiedSignupEntry(entry: {
  readonly source: string | null;
  readonly status: string | null;
}): boolean {
  return (
    entry.source === SIGNUP_WAITLIST_SOURCE &&
    isWaitlistPendingStatus(entry.status)
  );
}

export function buildSignupWaitlistEntryValues(email: string, now: Date) {
  const normalized = normalizeEmail(email);
  return {
    email: normalized,
    emailNormalized: normalized,
    emailHash: hashEmailForWaitlist(normalized),
    source: SIGNUP_WAITLIST_SOURCE,
    canonical: true,
    status: 'waitlisted' as const,
    statusReason: 'signup_pending_review',
    waitlistedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Insert the sign-up entry unless the email already has a canonical entry.
 * Returns true when a new entry was created.
 */
export async function insertSignupWaitlistEntry(
  client: DbOrTransaction,
  email: string,
  now = new Date()
): Promise<boolean> {
  if (!normalizeEmail(email)) return false;
  const inserted = await client
    .insert(waitlistEntries)
    .values(buildSignupWaitlistEntryValues(email, now))
    .onConflictDoNothing({
      target: waitlistEntries.emailNormalized,
      where: drizzleSql`${waitlistEntries.canonical} = true`,
    })
    .returning({ id: waitlistEntries.id });
  return inserted.length > 0;
}

/**
 * Provisioning hook: never throws, because a throw here would fail sign-in.
 * A miss is healed by the daily admission detector
 * (`reconcileWaitlistAdmission`), which also reports it.
 */
export async function ensureSignupWaitlistEntry(
  email: string | null | undefined
): Promise<void> {
  if (!email) return;
  try {
    await insertSignupWaitlistEntry(db, email);
  } catch (error) {
    logger.warn('[waitlist] sign-up entry insert failed', error);
    await captureError('Waitlist sign-up entry insert failed', error, {
      operation: 'ensureSignupWaitlistEntry',
    });
  }
}
