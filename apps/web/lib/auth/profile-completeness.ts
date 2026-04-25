/**
 * Canonical profile completeness check.
 *
 * This is the SINGLE SOURCE OF TRUTH for whether a profile is "complete"
 * (ready for dashboard access). All callers must use this function instead
 * of implementing their own checks. This eliminates the redirect loop bug
 * class where proxy, gate, dashboard, and client-side checks disagreed.
 *
 * A profile is complete when it has:
 * - username and usernameNormalized (handle claimed)
 * - displayName (not empty after trim)
 * - isPublic (not explicitly false)
 * - onboardingCompletedAt (onboarding finished)
 * - hasVisibleRelease when the caller can resolve launch readiness
 *
 * Avatar is NOT checked here — it's enforced client-side by
 * ProfileCompletionRedirect to avoid redirect loops during
 * onboarding steps 1-2 (avatar uploads asynchronously).
 *
 * profileId is NOT checked here — callers already guard against
 * null profiles before reaching this function (proxy LEFT JOINs,
 * gate checks profile existence separately).
 *
 * This module has NO 'server-only' directive and NO DB imports so it
 * works in Edge Runtime (proxy.ts), Node Runtime (gate.ts, dashboard),
 * and client bundles (ProfileCompletionRedirect.tsx).
 */

/**
 * Minimal profile shape needed for the completeness check.
 * Intentionally narrow — callers map their own query results to this.
 */
export interface ProfileCompletenessFields {
  username: string | null;
  usernameNormalized: string | null;
  displayName: string | null;
  isPublic: boolean | null;
  onboardingCompletedAt: Date | null;
  hasVisibleRelease?: boolean | null;
}

export function isProfileComplete(profile: ProfileCompletenessFields): boolean {
  const passesVisibleReleaseRequirement =
    profile.hasVisibleRelease === undefined
      ? true
      : profile.hasVisibleRelease === true;

  return (
    Boolean(profile.username?.trim()) &&
    Boolean(profile.usernameNormalized?.trim()) &&
    Boolean(profile.displayName?.trim()) &&
    profile.isPublic !== false &&
    Boolean(profile.onboardingCompletedAt) &&
    passesVisibleReleaseRequirement
  );
}
