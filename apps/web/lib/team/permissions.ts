import type {
  profileApprovalStatusEnum,
  profileRiskyActionEnum,
} from '@/lib/db/schema/enums';

/**
 * Least-privilege team roles for creator profiles (JOV-6601).
 *
 * Roles map 1:1 onto the `profile_claim_role` enum used by
 * `user_profile_claims`. `assistant` and `manager` are delegated roles that a
 * hijacked account could weaponize, so risky mutations either require owner
 * approval or are denied outright.
 */
export const TEAM_ROLES = ['owner', 'manager', 'assistant', 'viewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const RISKY_PROFILE_ACTIONS = [
  'links.mutate',
  'handle.change',
  'auth.change',
  'membership.manage',
  'broadcast.send',
] as const;
export type RiskyProfileAction =
  (typeof profileRiskyActionEnum.enumValues)[number];

export type ProfileApprovalStatus =
  (typeof profileApprovalStatusEnum.enumValues)[number];

export type ProfileActionDecision = 'allow' | 'deny' | 'requires_approval';

export type ProfileActionPolicy = {
  /** Roles that may execute the action directly. */
  direct: readonly TeamRole[];
  /** Roles that may execute the action only after owner approval. */
  approvable: readonly TeamRole[];
};

/**
 * Server-enforced action policy. This is the single source of truth — UI and
 * API variants must both consult `decideProfileAction` so neither can bypass
 * owner approval.
 *
 * - Destination- and audience-affecting actions (`links.mutate`,
 *   `broadcast.send`) are approval-gated for delegated roles.
 * - Identity- and security-affecting actions (`handle.change`, `auth.change`,
 *   `membership.manage`) are owner-only and cannot be delegated at all.
 * - `viewer` can never mutate.
 */
export const PROFILE_ACTION_POLICY: Record<
  RiskyProfileAction,
  ProfileActionPolicy
> = {
  'links.mutate': { direct: ['owner'], approvable: ['manager', 'assistant'] },
  'broadcast.send': {
    direct: ['owner'],
    approvable: ['manager', 'assistant'],
  },
  'handle.change': { direct: ['owner'], approvable: [] },
  'auth.change': { direct: ['owner'], approvable: [] },
  'membership.manage': { direct: ['owner'], approvable: [] },
};

export function isRiskyProfileAction(
  value: unknown
): value is RiskyProfileAction {
  return (
    typeof value === 'string' &&
    (RISKY_PROFILE_ACTIONS as readonly string[]).includes(value)
  );
}

export function decideProfileAction(
  role: TeamRole | null | undefined,
  action: RiskyProfileAction
): ProfileActionDecision {
  if (!role) return 'deny';
  const policy = PROFILE_ACTION_POLICY[action];
  if (policy.direct.includes(role)) return 'allow';
  if (policy.approvable.includes(role)) return 'requires_approval';
  return 'deny';
}

/**
 * Resolve the effective team role for a user on a profile, matching the
 * claim-first semantics of `lib/auth/profile-access.ts`: canonical claims win,
 * and the legacy `creator_profiles.user_id` owner applies only when the
 * profile has no claims at all.
 */
export function resolveTeamRole(input: {
  appUserId: string;
  legacyOwnerUserId: string | null;
  claimRows: ReadonlyArray<{ userId: string; role: string }>;
}): TeamRole | null {
  if (input.claimRows.length > 0) {
    const claim = input.claimRows.find(row => row.userId === input.appUserId);
    if (!claim) return null;
    return (TEAM_ROLES as readonly string[]).includes(claim.role)
      ? (claim.role as TeamRole)
      : null;
  }
  return input.legacyOwnerUserId === input.appUserId ? 'owner' : null;
}
