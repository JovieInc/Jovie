import 'server-only';

import { and, eq, gt } from 'drizzle-orm';
import { TEST_AUTH_BYPASS_SESSION_PREFIX } from '@/lib/auth/test-mode-constants';
import { db } from '@/lib/db';
import { baVerifications } from '@/lib/db/schema/better-auth';
import { isVisualCaptureSyntheticAuthEnabled } from '@/lib/e2e/runtime';
import { adminStepUpIdentifier } from './mfa-seed';

export {
  ADMIN_STEP_UP_TTL_MS,
  adminStepUpIdentifier,
  PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS,
  seedAdminMfaStepUpForBypassUser,
  seedAdminMfaStepUpReceipt,
} from './mfa-seed';

/** True when this session has an unexpired passkey step-up (JOV-4806). Fail closed. */
export async function hasRecentAdminMfaReverification(
  authResult: { readonly sessionId?: string | null } | null | undefined
): Promise<boolean> {
  const sessionId = authResult?.sessionId;
  if (!sessionId) return false;
  // Visual capture has no ba_verifications (JOV-7126); only sess_test_bypass_* exempt.
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
