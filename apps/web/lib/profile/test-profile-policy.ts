import { isTestProfileOwnerEmail, normalizeEmail } from '@/lib/utils/email';

/**
 * Test-profile policy: the single place that decides whether a public profile
 * belongs to a test/e2e/golden-path account.
 *
 * - Classification comes only from `isTestProfileOwnerEmail` (lib/utils/email).
 * - Discovery (sitemap, search, directory, related/credit links, feeds) always
 *   excludes test profiles, exempt or not.
 * - The public route (`/[username]`) 404s non-exempt test profiles. Exempt
 *   profiles (canary fixtures) stay viewable by direct URL only.
 *
 * Exemption hook: add an exact handle or owner email below, or have a harness
 * set `creator_profiles.settings.testProfileDirectUrlExempt = true` for the
 * duration of a run (the golden-path spec does this; teardown unpublishes the
 * profile afterwards).
 */

export const TEST_PROFILE_DIRECT_URL_EXEMPT_SETTING =
  'testProfileDirectUrlExempt' as const;

/**
 * Canary and auth-surface fixtures that must stay viewable by URL (and are
 * never touched by cleanup). Exact handles only; all remain excluded from the
 * sitemap and discovery.
 */
export const TEST_PROFILE_DIRECT_URL_EXEMPT_HANDLES: readonly string[] =
  Object.freeze([
    'authqaprod',
    'authqastaging',
    'authiosprod',
    'authiosstaging',
    'browse-ready-user',
    'good-dropouts-canary',
    'unmarked-pavement',
  ]);

/** Canary/auth-surface owner mailboxes whose profiles stay viewable. Exact only. */
export const TEST_PROFILE_DIRECT_URL_EXEMPT_OWNER_EMAILS: readonly string[] =
  Object.freeze([
    'browse-ready+clerk_test@jov.ie',
    'browse-ready+canary-admitted@jov.ie',
    'auth-surface-qa+prod@test.jovie.com',
    'auth-surface-qa+staging@test.jovie.com',
    'auth-surface-qa+ios-prod@test.jovie.com',
    'auth-surface-qa+ios-staging@test.jovie.com',
  ]);

export interface TestProfileIdentity {
  readonly handle?: string | null;
  readonly ownerEmail?: string | null;
  readonly settings?: unknown;
}

export function isTestProfile(
  identity: Pick<TestProfileIdentity, 'ownerEmail'>
): boolean {
  return isTestProfileOwnerEmail(identity.ownerEmail);
}

function hasExemptSetting(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  return (
    (settings as Record<string, unknown>)[
      TEST_PROFILE_DIRECT_URL_EXEMPT_SETTING
    ] === true
  );
}

export function isTestProfileDirectUrlExempt(
  identity: TestProfileIdentity
): boolean {
  const handle = identity.handle?.trim().toLowerCase() ?? '';
  if (handle && TEST_PROFILE_DIRECT_URL_EXEMPT_HANDLES.includes(handle)) {
    return true;
  }
  if (
    identity.ownerEmail &&
    TEST_PROFILE_DIRECT_URL_EXEMPT_OWNER_EMAILS.includes(
      normalizeEmail(identity.ownerEmail)
    )
  ) {
    return true;
  }
  return hasExemptSetting(identity.settings);
}

/** True when `/[username]` must 404 this profile. */
export function shouldHideTestProfileFromDirectUrl(
  identity: TestProfileIdentity
): boolean {
  return isTestProfile(identity) && !isTestProfileDirectUrlExempt(identity);
}

/**
 * Cleanup protection: canary fixtures that are exempt by exact handle/email are
 * never unpublished or unbound. The per-run settings exemption deliberately
 * does NOT protect from cleanup (the golden-path teardown must clean its own
 * profile).
 */
export function isTestProfileCleanupProtected(
  identity: Pick<TestProfileIdentity, 'handle' | 'ownerEmail'>
): boolean {
  return isTestProfileDirectUrlExempt({ ...identity, settings: null });
}
