import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import {
  STATUS_PRECEDENCE,
  type UserLifecycleStatus,
} from '@/lib/waitlist/status-precedence';

/**
 * User-level admission and activation, shared by the founder funnel, the PMF
 * survey eligibility check and the admin PMF metric so the three can never
 * disagree.
 *
 * - Admitted: let in past the waitlist and not suspended or banned, i.e. any
 *   lifecycle status from `waitlist_approved` through `active` in the
 *   canonical status precedence.
 * - Activated: the founder funnel's `onboarding_complete` stage, which the
 *   company state already reports as `activated`. It is the user-level form
 *   of the activation pilot's `onboarding_completed` outcome alias
 *   (`PROOF_CLAIM_ACTIVATION_ALIASES`): a profile the user owns finished
 *   onboarding.
 */
export const ADMITTED_USER_STATUSES = (
  Object.keys(STATUS_PRECEDENCE) as UserLifecycleStatus[]
).filter(
  status =>
    STATUS_PRECEDENCE[status] >= STATUS_PRECEDENCE.waitlist_approved &&
    STATUS_PRECEDENCE[status] <= STATUS_PRECEDENCE.active
);

export function isAdmittedUserStatus(status: string | null): boolean {
  return (ADMITTED_USER_STATUSES as readonly string[]).includes(status ?? '');
}

/** SQL predicate: the user's lifecycle status counts as admitted. */
export function admittedUserSql(userStatus: SQL): SQL {
  return drizzleSql`${userStatus}::text IN (${drizzleSql.join(
    ADMITTED_USER_STATUSES.map(status => drizzleSql`${status}`),
    drizzleSql`, `
  )})`;
}

/** SQL predicate: a profile owned by the user finished onboarding. */
export function activatedUserSql(userId: SQL): SQL {
  return drizzleSql`EXISTS (
        SELECT 1 FROM creator_profiles cp
        WHERE cp.user_id = ${userId} AND cp.onboarding_completed_at IS NOT NULL
      )`;
}
