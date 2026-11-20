/**
 * One answer to "may this account create or complete a public, claimed creator
 * profile?". The mobile completion path and the dashboard additional-profile
 * action both gate on it; a path that creates a claimed profile without it lets
 * a waitlisted, banned or suspended account become public
 * (tests/unit/security/profile-setup-eligibility.test.ts).
 */
const BLOCKED_PROFILE_SETUP_STATUSES: ReadonlySet<string> = new Set([
  'banned',
  'suspended',
  'waitlist_pending',
]);

export function canSetUpPublicProfile(
  userStatus: string | null | undefined
): boolean {
  return !userStatus || !BLOCKED_PROFILE_SETUP_STATUSES.has(userStatus);
}
