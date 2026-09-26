import 'server-only';

import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { baVerifications } from '@/lib/db/schema/better-auth';

/** A passkey (Touch ID) step-up unlocks admin data for this long. */
export const ADMIN_STEP_UP_TTL_MS = 12 * 60 * 60 * 1000;

/** First passkey enrollment requires a sign-in at most this old. */
export const PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS = 10 * 60 * 1000;

export function adminStepUpIdentifier(sessionId: string): string {
  return `admin-step-up:${sessionId}`;
}

/**
 * True when this exact Better Auth session was created by a passkey
 * authentication within ADMIN_STEP_UP_TTL_MS (JOV-4806). The receipt is
 * written by the Better Auth after-hook on `/passkey/verify-authentication`.
 * Any read failure fails closed.
 */
export async function hasRecentAdminMfaReverification(
  authResult: { readonly sessionId?: string | null } | null | undefined
): Promise<boolean> {
  const sessionId = authResult?.sessionId;
  if (!sessionId) return false;
  try {
    const [row] = await db
      .select({ id: baVerifications.id })
      .from(baVerifications)
      .where(
        and(
          eq(baVerifications.identifier, adminStepUpIdentifier(sessionId)),
          gt(baVerifications.expiresAt, new Date())
        )
      )
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}
