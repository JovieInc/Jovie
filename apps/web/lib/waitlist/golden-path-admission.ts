/**
 * Golden-path admission (Tim policy 2026-10-25): admit when the golden path is
 * green, gate on capacity, best leads first. A resolved artist whose identity
 * the server confirmed is admitted instead of turn-capped onto the waitlist.
 *
 * Pure and shared: the chat access gate (`decideOnboardingAccess`) and the
 * waitlist access request both call it, so what the chat tells the artist and
 * what the server does cannot drift. Admission state only: this module never
 * sends email, an invite or any message to a person.
 *
 * Capacity is not decided here. The caller reserves a slot with the existing
 * `tryReserveAutoAcceptSlot` (daily limit) and the cohort-learnings throttle,
 * so the auto-accept settings stay the single capacity control.
 */
import { requiresClaimVerification } from '@/lib/claim/claim-verification';

export type GoldenPathVerdict = 'ELIGIBLE' | 'BLOCKED' | 'UNKNOWN';

export type GoldenPathAdmissionReason =
  | 'admit_resolved_artist'
  | 'hold_identity_unresolved'
  | 'hold_reach_unknown'
  | 'hold_high_profile_needs_verification'
  | 'hold_golden_path_not_green'
  | 'hold_capacity_full'
  | 'hold_auto_accept_disabled'
  | 'hold_outranked'
  | 'hold_open_learnings';

export interface GoldenPathAdmissionInput {
  /** Server-confirmed Spotify artist id (confirmSpotifyArtist output). */
  readonly spotifyArtistId: string | null;
  /** Server-derived follower reach; null when unknown. */
  readonly reach: number | null;
  /** Acquisition eligibility verdict; null when it could not be read. */
  readonly goldenPathVerdict: GoldenPathVerdict | null;
}

export interface GoldenPathAdmissionDecision {
  readonly admit: boolean;
  readonly reason: GoldenPathAdmissionReason;
}

/**
 * Order matters and every branch fails closed:
 * identity first (nothing is admitted without it), then identity safety
 * (high-profile artists keep the verification path), then the golden path.
 */
export function decideGoldenPathAdmission(
  input: GoldenPathAdmissionInput
): GoldenPathAdmissionDecision {
  if (!input.spotifyArtistId) {
    return { admit: false, reason: 'hold_identity_unresolved' };
  }
  if (input.reach === null || !Number.isFinite(input.reach)) {
    return { admit: false, reason: 'hold_reach_unknown' };
  }
  if (requiresClaimVerification(input.reach)) {
    return { admit: false, reason: 'hold_high_profile_needs_verification' };
  }
  if (input.goldenPathVerdict !== 'ELIGIBLE') {
    return { admit: false, reason: 'hold_golden_path_not_green' };
  }
  return { admit: true, reason: 'admit_resolved_artist' };
}
