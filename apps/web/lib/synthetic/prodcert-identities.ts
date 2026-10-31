import { DEFAULT_DEV_TEST_AUTH_EMAILS } from '@/lib/auth/dev-test-auth-identity';
import { normalizeEmail } from '@/lib/utils/email';

/**
 * Production certification canary identities (JOV-9625).
 *
 * One source of truth for the addresses the production golden-path run may
 * act as. All live on jov.ie, a domain Jovie controls, and all are
 * classified internal by `isInternalOrTestAccountEmail`, so nothing they do
 * reaches customer metrics:
 *
 *   - the seeded returning canary (`browse-ready+clerk_test@jov.ie`), which
 *     owns a claimed profile;
 *   - per-run new-user addresses
 *     `browse-ready+synthetic-prodcert-<run>@jov.ie`;
 *   - the documented admin fixture (`browse-admin+clerk_test@jov.ie`), used
 *     only for the admin certifications-inventory readback (JOV-9625
 *     outcome rework). It never acts as a creator: no passage-token mint
 *     scopes target it, and the readback refuses to write.
 *
 * The OTP reader and the passage token both refuse every other address.
 */
export const PRODCERT_RETURNING_CANARY_EMAIL =
  DEFAULT_DEV_TEST_AUTH_EMAILS['creator-ready'];

/**
 * The admin persona readback fixture (JOV-9625 outcome rework). Signing in
 * as this address exercises `authorizeSummerControl` end to end; the
 * readback is read-only and records the exact blocker when the fixture is
 * not a production admin.
 */
export const PRODCERT_ADMIN_READBACK_EMAIL = DEFAULT_DEV_TEST_AUTH_EMAILS.admin;

/**
 * Exact canary addresses whose chats run inside release gates (production
 * promotion smoke, golden-path walks) and so must never hit the weekly AI
 * quota: a 429 there blocks promotion, not a customer. The server skips only
 * the weekly quota for a session whose own email is in this list; the hourly
 * burst limiter still applies. Exact match, no patterns: per-run
 * `synthetic-prodcert-*` users and every real address stay metered.
 */
export const WEEKLY_AI_QUOTA_EXEMPT_CANARY_EMAILS: readonly string[] =
  Object.freeze([PRODCERT_RETURNING_CANARY_EMAIL]);

export function isWeeklyAiQuotaExemptEmail(
  email: string | null | undefined
): boolean {
  return (
    !!email &&
    WEEKLY_AI_QUOTA_EXEMPT_CANARY_EMAILS.includes(normalizeEmail(email))
  );
}

export const PRODCERT_NEW_USER_EMAIL_PATTERN =
  /^browse-ready\+synthetic-prodcert-(?:[a-z\d]){6,24}@jov\.ie$/u;

export function isProdcertCanaryEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return (
    normalized === PRODCERT_RETURNING_CANARY_EMAIL ||
    normalized === PRODCERT_ADMIN_READBACK_EMAIL ||
    PRODCERT_NEW_USER_EMAIL_PATTERN.test(normalized)
  );
}

export function newProdcertUserEmail(runId: string): string {
  const slug = runId
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
    .slice(0, 24);
  const email = `browse-ready+synthetic-prodcert-${slug}@jov.ie`;
  if (!PRODCERT_NEW_USER_EMAIL_PATTERN.test(email)) {
    throw new Error('Run id cannot form a valid prodcert canary address.');
  }
  return email;
}
