import 'server-only';
// @coverage-via apps/web/tests/unit/lib/admin/mfa.test.ts

import { testAuthBypassSessionId } from '@/lib/auth/test-mode-constants';
import { db } from '@/lib/db';
import { baVerifications } from '@/lib/db/schema/better-auth';
import { logger } from '@/lib/utils/logger';
import { ADMIN_STEP_UP_TTL_MS, adminStepUpIdentifier } from './mfa-constants';

/**
 * Seed a live admin step-up receipt for a known session id. Used by the
 * gated E2E/dev test-auth admin persona so requireAdmin / entitlements see
 * the same ba_verifications proof production passkeys write — never a
 * production MFA bypass.
 *
 * Leaf module (no auth/dev-test imports) so test-auth can call it without
 * forming an import cycle through proxy-state/roles.
 */
export async function seedAdminMfaStepUpReceipt(
  sessionId: string
): Promise<void> {
  if (!sessionId) return;
  const now = new Date();
  const identifier = adminStepUpIdentifier(sessionId);
  await db
    .insert(baVerifications)
    .values({
      id: identifier,
      identifier,
      value: now.toISOString(),
      expiresAt: new Date(now.getTime() + ADMIN_STEP_UP_TTL_MS),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: baVerifications.id,
      set: {
        value: now.toISOString(),
        expiresAt: new Date(now.getTime() + ADMIN_STEP_UP_TTL_MS),
        updatedAt: now,
      },
    });
}

/** Deterministic bypass session id used by `resolveRequestAuth`. */
export function seedAdminMfaStepUpForBypassUser(
  dbUserId: string
): Promise<void> {
  return seedAdminMfaStepUpReceipt(testAuthBypassSessionId(dbUserId));
}

/** Best-effort seed so missing DB never blocks the gated test-auth enter path. */
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
