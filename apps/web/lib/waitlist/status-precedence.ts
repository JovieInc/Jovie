import 'server-only';

/**
 * User status lifecycle precedence.
 *
 * Higher numeric rank = further along in the lifecycle. We never overwrite a
 * higher-rank status with a lower-rank one. This is the single source of truth
 * shared by the waitlist access-request flow and the onboarding intake flow,
 * so both paths agree on what counts as a downgrade.
 *
 * Rank values intentionally cluster the active-creator states (claimed,
 * onboarding, fully active) above the waitlist states. `suspended` and
 * `banned` are terminal moderation states and must never be silently moved
 * back into a lifecycle state by an automated path.
 */
export const STATUS_RANK = {
  waitlist_pending: 1,
  waitlist_approved: 2,
  profile_claimed: 3,
  onboarding_incomplete: 4,
  active: 5,
  suspended: 6,
  banned: 7,
} as const;

export type LifecycleUserStatus = keyof typeof STATUS_RANK;

/**
 * Returns true if `next` is the same as `current` or is a forward move in the
 * lifecycle. Returns false (i.e. the write should be rejected as a downgrade)
 * if `next` would move the user backwards.
 *
 * Unknown statuses are treated as "do not overwrite" — fail closed.
 */
export function isStatusUpgrade(
  current: string | null | undefined,
  next: LifecycleUserStatus
): boolean {
  if (!current) return true;
  const currentRank = STATUS_RANK[current as LifecycleUserStatus];
  if (currentRank === undefined) {
    // Unknown current status: don't downgrade, don't overwrite.
    return false;
  }
  const nextRank = STATUS_RANK[next];
  return nextRank >= currentRank;
}
