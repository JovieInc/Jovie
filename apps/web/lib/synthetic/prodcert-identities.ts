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
 *   - the chat-health canary (`browse-ready+chat-health@jov.ie`), used only by
 *     the post-deploy `/api/chat` health check;
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
 * Dedicated chat-health canary. The post-deploy `/api/chat` health check
 * signs in as this account, never as the returning-creator canary, so health
 * checks cannot consume the returning canary's weekly AI quota (golden-path
 * walk first chat question got "weekly AI message limit", 2026-10-31).
 * Exact match only: it owns a claimed profile (see
 * `RETURNING_CANARY_SEED_SPEC`) and is the one identity whose weekly chat
 * quota the server skips (burst limiter still applies).
 */
export const PRODCERT_CHAT_HEALTH_CANARY_EMAIL =
  'browse-ready+chat-health@jov.ie';

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
    normalized === PRODCERT_CHAT_HEALTH_CANARY_EMAIL ||
    PRODCERT_NEW_USER_EMAIL_PATTERN.test(normalized)
  );
}

/** Exact, server-validated identity check (the caller passes the session user's email). */
export function isChatHealthCanaryEmail(
  email: string | null | undefined
): boolean {
  return !!email && normalizeEmail(email) === PRODCERT_CHAT_HEALTH_CANARY_EMAIL;
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
