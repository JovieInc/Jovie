/**
 * Status precedence helper for the user lifecycle enum.
 *
 * Used by waitlist intake and access-request flows to prevent silently
 * downgrading a user's `userStatus` when concurrent paths (admin approval,
 * webhook updates, intake submissions) race against each other.
 *
 * Higher rank = further along the lifecycle. Treat unknown / null current
 * statuses as the lowest rank so any new value is accepted.
 *
 * NOTE: This is the canonical helper. Do not duplicate this precedence
 * table in call-sites — import `isStatusUpgrade` / `STATUS_PRECEDENCE`
 * instead.
 */

import type { userStatusLifecycleEnum } from '@/lib/db/schema/enums';

export type UserLifecycleStatus =
  (typeof userStatusLifecycleEnum.enumValues)[number];

export const STATUS_PRECEDENCE: Record<UserLifecycleStatus, number> = {
  waitlist_pending: 1,
  waitlist_approved: 2,
  profile_claimed: 3,
  onboarding_incomplete: 4,
  active: 5,
  // Terminal/admin-controlled states must never be silently downgraded by
  // an intake or access-request flow. Rank them above `active` so any
  // would-be downgrade is rejected.
  suspended: 6,
  banned: 7,
};

/**
 * Returns true if `next` is a non-downgrading transition from `current`.
 *
 * - If `current` is null/undefined (new user), any `next` is accepted.
 * - If `next` has equal or higher rank than `current`, accept.
 * - Otherwise reject (would be a downgrade).
 */
export function isStatusUpgrade(
  current: UserLifecycleStatus | null | undefined,
  next: UserLifecycleStatus
): boolean {
  if (current == null) return true;
  return STATUS_PRECEDENCE[next] >= STATUS_PRECEDENCE[current];
}
