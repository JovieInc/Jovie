/**
 * Pure planner for the canary account reset (JOV-9826).
 *
 * The production claim + onboarding certification needs a real pre-claim to
 * claimed walk, which no other canary can have: claiming publishes a public
 * profile. The fixed claim-walk canary (`prodcert-identities.ts`) owns one
 * reserved, noindex handle, and `/api/internal/canary/reset` returns its
 * account to the exact pre-claim state after every walk.
 *
 * This module owns the reset SEMANTICS as a pure plan so they are testable
 * without a database:
 *
 *   - the account email must equal the claim-walk canary address exactly —
 *     any other account is refused (the executor enforces this again);
 *   - the reserved handle is soft-unclaimed: ownership claims rows are
 *     deleted and the profile's claim fields are cleared, but the profile
 *     row itself survives (the handle stays reserved and noindex);
 *   - onboarding completion is cleared;
 *   - the structured-credit marker flips back to `unclaimed` when present,
 *     mirroring `markStructuredCreditProfileClaimed` in the claim finalize;
 *   - only rows owned by the canary user id are touched, and only in the
 *     enumerated walk-owned tables (chat conversations, suggested actions).
 *
 * The executor (`canary-reset.server.ts`) reads the rows, applies this plan
 * in one transaction, and writes the ownership-audit log entry.
 */

/** Exact email the reset may ever act on (normalized before compare). */
export function isClaimWalkCanaryEmail(
  email: string | null | undefined
): boolean {
  return (
    typeof email === 'string' &&
    email.trim().toLowerCase() ===
      'browse-ready+synthetic-prodcert-claim@jov.ie'
  );
}

export interface CanaryResetUserRow {
  readonly id: string;
  readonly email: string | null;
}

export interface CanaryResetClaimRow {
  readonly id: string;
  readonly userId: string;
}

export interface CanaryResetProfileRow {
  readonly id: string;
  readonly userId: string | null;
  readonly usernameNormalized: string | null;
  readonly isClaimed: boolean | null;
  readonly isPublic: boolean | null;
  readonly claimedAt: Date | null;
  readonly claimToken: string | null;
  readonly claimTokenExpiresAt: Date | null;
  readonly onboardingCompletedAt: Date | null;
  readonly settings: unknown;
}

/** Column writes that return one profile row to its pre-claim state. */
export interface CanaryResetProfileSet {
  readonly userId: null;
  readonly isClaimed: false;
  readonly isPublic: false;
  readonly claimedAt: null;
  readonly claimToken: null;
  readonly claimTokenExpiresAt: null;
  readonly onboardingCompletedAt: null;
  readonly settings: unknown;
}

export interface CanaryResetProfileUpdate {
  readonly id: string;
  readonly usernameNormalized: string | null;
  readonly set: CanaryResetProfileSet;
}

export interface CanaryResetPlan {
  readonly canaryUserId: string;
  /** `user_profile_claims` row ids to delete (soft-unclaim). */
  readonly claimRowIds: readonly string[];
  readonly profileUpdates: readonly CanaryResetProfileUpdate[];
  /** Walk-owned conversation cleanup (messages cascade with the row). */
  readonly deleteChatConversations: boolean;
  /** Walk-owned agent-suggestion cleanup. */
  readonly deleteSuggestedActions: boolean;
}

/** The pre-claim marker state, mirroring the claim finalize's claimed flip. */
const STRUCTURED_CREDIT_SOURCE = 'structured_spotify_release_credit';

function resetSettingsMarker(settings: unknown): unknown {
  if (
    typeof settings !== 'object' ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return settings;
  }
  const record = settings as Record<string, unknown>;
  const marker = record.unclaimedArtistProfile;
  if (typeof marker !== 'object' || marker === null || Array.isArray(marker)) {
    return settings;
  }
  const m = marker as Record<string, unknown>;
  if (
    m.source !== STRUCTURED_CREDIT_SOURCE ||
    (m.state !== 'claimed' && m.state !== 'unclaimed')
  ) {
    return settings;
  }
  if (m.state === 'unclaimed') return settings;
  const { claimedAt: _drop, ...rest } = m;
  return {
    ...record,
    unclaimedArtistProfile: { ...rest, state: 'unclaimed' },
  };
}

/**
 * Build the reset plan for one account. Throws when the account is not the
 * claim-walk canary — the caller (endpoint + executor) treats that as a
 * refused reset, never a partial one.
 */
export function planCanaryReset(input: {
  readonly user: CanaryResetUserRow;
  readonly claimRows: readonly CanaryResetClaimRow[];
  readonly profileRows: readonly CanaryResetProfileRow[];
}): CanaryResetPlan {
  if (!isClaimWalkCanaryEmail(input.user.email)) {
    throw new Error(
      '[CANARY_RESET_REFUSED] Reset may only act on the fixed claim-walk canary identity'
    );
  }
  const profileUpdates = input.profileRows
    .filter(
      p =>
        p.userId === input.user.id &&
        (p.isClaimed === true ||
          p.isPublic === true ||
          p.claimedAt !== null ||
          p.claimToken !== null ||
          p.claimTokenExpiresAt !== null ||
          p.onboardingCompletedAt !== null)
    )
    .map(p => ({
      id: p.id,
      usernameNormalized: p.usernameNormalized,
      set: {
        userId: null,
        isClaimed: false,
        isPublic: false,
        claimedAt: null,
        claimToken: null,
        claimTokenExpiresAt: null,
        onboardingCompletedAt: null,
        settings: resetSettingsMarker(p.settings),
      },
    }));
  return {
    canaryUserId: input.user.id,
    claimRowIds: input.claimRows
      .filter(c => c.userId === input.user.id)
      .map(c => c.id),
    profileUpdates,
    deleteChatConversations: true,
    deleteSuggestedActions: true,
  };
}

/**
 * Redacted summary for the audit log and the endpoint response: row counts
 * and handle names only — never ids of other tables, emails, or tokens.
 */
export function summarizeCanaryResetPlan(plan: CanaryResetPlan): string {
  const handles = plan.profileUpdates
    .map(p => p.usernameNormalized)
    .filter((h): h is string => typeof h === 'string');
  return [
    `claims=${plan.claimRowIds.length}`,
    `profiles=${plan.profileUpdates.length}`,
    handles.length > 0 ? `handles=${handles.join(',')}` : null,
    plan.deleteChatConversations ? 'chat=purged' : null,
    plan.deleteSuggestedActions ? 'suggestions=purged' : null,
  ]
    .filter(Boolean)
    .join(' ');
}
