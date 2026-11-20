import 'server-only';

import { and, eq, gt } from 'drizzle-orm';
import { TEST_AUTH_BYPASS_SESSION_PREFIX } from '@/lib/auth/test-mode-constants';
import { db } from '@/lib/db';
import { baVerifications } from '@/lib/db/schema/better-auth';
import { isVisualCaptureSyntheticAuthEnabled } from '@/lib/e2e/runtime';
import { adminStepUpIdentifier } from './mfa-constants';

export {
  ADMIN_STEP_UP_TTL_MS,
  adminStepUpIdentifier,
  PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS,
} from './mfa-constants';
export {
  seedAdminMfaStepUpForBypassUser,
  seedAdminMfaStepUpReceipt,
} from './mfa-seed';

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
  // Secretless PR visual capture has no ba_verifications table (JOV-7126).
  // Only the producer's own test-auth bypass session id shape is exempt —
  // production sessions never use this prefix, and normal E2E with a DB
  // seeds a real receipt instead of taking this branch.
  if (
    isVisualCaptureSyntheticAuthEnabled() &&
    sessionId.startsWith(TEST_AUTH_BYPASS_SESSION_PREFIX)
  ) {
    return true;
  }
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
