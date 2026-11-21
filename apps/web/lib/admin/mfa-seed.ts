import 'server-only';
// @coverage-via apps/web/tests/unit/lib/admin/mfa.test.ts

import { testAuthBypassSessionId } from '@/lib/auth/test-mode-constants';
import { db } from '@/lib/db';
import { baVerifications } from '@/lib/db/schema/better-auth';
import { logger } from '@/lib/utils/logger';

/** Passkey step-up unlocks admin for this long. */
export const ADMIN_STEP_UP_TTL_MS = 12 * 60 * 60 * 1000;
/** First passkey enrollment requires a sign-in at most this old. */
export const PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS = 10 * 60 * 1000;

export function adminStepUpIdentifier(sessionId: string): string {
  return `admin-step-up:${sessionId}`;
}

/** Seed step-up receipt for gated E2E/dev admin personas. */
export async function seedAdminMfaStepUpReceipt(
  sessionId: string
): Promise<void> {
  if (!sessionId) return;
  const now = new Date();
  const identifier = adminStepUpIdentifier(sessionId);
  const expiresAt = new Date(now.getTime() + ADMIN_STEP_UP_TTL_MS);
  const value = now.toISOString();
  await db
    .insert(baVerifications)
    .values({
      id: identifier,
      identifier,
      value,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: baVerifications.id,
      set: { value, expiresAt, updatedAt: now },
    });
}

export function seedAdminMfaStepUpForBypassUser(
  dbUserId: string
): Promise<void> {
  return seedAdminMfaStepUpReceipt(testAuthBypassSessionId(dbUserId));
}

/** Best-effort; missing DB must not block gated test-auth enter. */
export async function seedAdminMfaStepUpBestEffort(
  kind: 'bypass' | 'session',
  id: string
): Promise<void> {
  try {
    if (kind === 'bypass') await seedAdminMfaStepUpForBypassUser(id);
    else await seedAdminMfaStepUpReceipt(id);
  } catch (error) {
    logger.warn(
      'Failed to seed admin MFA step-up for test-auth persona',
      {
        kind,
        id,
        error: error instanceof Error ? error.message : String(error),
      },
      'dev-test-auth'
    );
  }
}
