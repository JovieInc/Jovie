/**
 * Right-artist confidence for a creator profile (JOV-7823 / JOV-7323).
 *
 * Answers one question for per-profile certification: how sure are we that the
 * provider artist bound to this profile is the person who owns it? The score is
 * built only from evidence we can point at. A vendor match with no recorded
 * evidence (legacy MusicFetch rows: `auto_confirmed`, null confidence, zero
 * ISRCs) adds nothing, so it can never certify an identity on its own.
 *
 * Below {@link ARTIST_IDENTITY_CERTIFY_THRESHOLD} the profile is not
 * auto-approved: the owner is asked to confirm their artist in-product (a
 * `suggested` row on the existing DSP suggestion surface). A contradiction
 * between bound identities is never certifiable until it is resolved.
 */

export const ARTIST_IDENTITY_CONFIDENCE_VERSION = 1 as const;

/** Certify at or above this score; otherwise ask the owner to confirm. */
export const ARTIST_IDENTITY_CERTIFY_THRESHOLD = 0.85;

/** Same thresholds the DSP matcher uses before it auto-confirms. */
export const EVIDENCED_MATCH_MIN_CONFIDENCE = 0.8;
export const EVIDENCED_MATCH_MIN_ISRCS = 3;

export const ARTIST_IDENTITY_WEIGHTS = {
  /** The owner picked or pasted this provider artist during onboarding. */
  boundProviderIdentity: 0.55,
  /** Another provider agrees through shared recordings (ISRC evidence). */
  isrcCorroboration: 0.3,
  /** The owner explicitly confirmed a match in-product. */
  ownerConfirmed: 0.4,
  /** Another profile claims the same display name with a different artist. */
  sameNameCollision: -0.25,
} as const;

export type ArtistIdentityDecision =
  | 'certified'
  | 'needs_confirmation'
  | 'conflict'
  | 'unbound';

export type ArtistIdentityReason =
  | 'bound_provider_identity'
  | 'isrc_corroborated'
  | 'owner_confirmed'
  | 'same_name_collision'
  | 'unverified_vendor_match'
  | 'owner_rejected_bound_identity'
  | 'contradicting_provider_identity'
  | 'no_provider_identity';

export interface ArtistIdentityMatchEvidence {
  readonly providerId: string;
  readonly externalArtistId: string | null;
  readonly status: 'suggested' | 'confirmed' | 'rejected' | 'auto_confirmed';
  readonly matchSource: string | null;
  readonly confidenceScore: number | null;
  readonly matchingIsrcCount: number;
}

export interface ArtistIdentityEvidence {
  /** Provider artist ids bound on the profile row (e.g. spotify_id). */
  readonly boundIds: Readonly<Partial<Record<string, string | null>>>;
  readonly matches: readonly ArtistIdentityMatchEvidence[];
  /** Other profiles with the same normalized display name and a different artist. */
  readonly sameNameCollisions: number;
}

export interface ArtistIdentityConfidence {
  readonly version: typeof ARTIST_IDENTITY_CONFIDENCE_VERSION;
  readonly score: number;
  readonly decision: ArtistIdentityDecision;
  readonly reasons: readonly ArtistIdentityReason[];
  /** Matches that look confirmed but carry no evidence. Counted, never trusted. */
  readonly unverifiedVendorMatches: number;
  readonly threshold: number;
}

const ACCEPTED = new Set(['confirmed', 'auto_confirmed']);

/** A match is evidenced only when the matcher recorded ISRC-backed confidence. */
export function isEvidencedMatch(match: ArtistIdentityMatchEvidence): boolean {
  return (
    match.confidenceScore !== null &&
    match.confidenceScore >= EVIDENCED_MATCH_MIN_CONFIDENCE &&
    match.matchingIsrcCount >= EVIDENCED_MATCH_MIN_ISRCS
  );
}

/**
 * Owner-confirmed suggestions and manual links both write `confirmed`;
 * machine matchers write `auto_confirmed` or `suggested`.
 */
function isOwnerConfirmed(match: ArtistIdentityMatchEvidence): boolean {
  return match.status === 'confirmed';
}

function round(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

export function scoreArtistIdentity(
  evidence: ArtistIdentityEvidence
): ArtistIdentityConfidence {
  const reasons: ArtistIdentityReason[] = [];
  const bound = Object.entries(evidence.boundIds).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].length > 0
  );
  const matchesBoundIdentity = (match: ArtistIdentityMatchEvidence) =>
    bound.some(
      ([providerId, externalArtistId]) =>
        match.providerId === providerId &&
        match.externalArtistId === externalArtistId
    );
  const accepted = evidence.matches.filter(match => ACCEPTED.has(match.status));
  const unverifiedVendorMatches = accepted.filter(
    match => !isEvidencedMatch(match) && !isOwnerConfirmed(match)
  ).length;
  if (unverifiedVendorMatches > 0) reasons.push('unverified_vendor_match');

  const contradiction = accepted.some(match => {
    const boundId = evidence.boundIds[match.providerId];
    return (
      typeof boundId === 'string' &&
      boundId.length > 0 &&
      match.externalArtistId !== null &&
      match.externalArtistId !== boundId
    );
  });
  const result = (score: number, decision: ArtistIdentityDecision) => ({
    version: ARTIST_IDENTITY_CONFIDENCE_VERSION,
    score: round(score),
    decision,
    reasons,
    unverifiedVendorMatches,
    threshold: ARTIST_IDENTITY_CERTIFY_THRESHOLD,
  });
  if (
    evidence.matches.some(
      match => match.status === 'rejected' && matchesBoundIdentity(match)
    )
  ) {
    reasons.push('owner_rejected_bound_identity');
    return result(0, 'conflict');
  }
  if (contradiction) {
    reasons.push('contradicting_provider_identity');
    return result(0, 'conflict');
  }

  const ownerConfirmed = accepted.some(
    match => isOwnerConfirmed(match) && matchesBoundIdentity(match)
  );
  if (!bound.length && !ownerConfirmed) {
    reasons.push('no_provider_identity');
    return result(0, 'unbound');
  }

  let score = 0;
  if (bound.length) {
    score += ARTIST_IDENTITY_WEIGHTS.boundProviderIdentity;
    reasons.push('bound_provider_identity');
  }
  if (accepted.some(isEvidencedMatch)) {
    score += ARTIST_IDENTITY_WEIGHTS.isrcCorroboration;
    reasons.push('isrc_corroborated');
  }
  if (ownerConfirmed) {
    score += ARTIST_IDENTITY_WEIGHTS.ownerConfirmed;
    reasons.push('owner_confirmed');
  }
  // The owner's own confirmation settles a same-name collision.
  if (evidence.sameNameCollisions > 0 && !ownerConfirmed) {
    score += ARTIST_IDENTITY_WEIGHTS.sameNameCollision;
    reasons.push('same_name_collision');
  }
  const final = round(score);
  return result(
    final,
    final >= ARTIST_IDENTITY_CERTIFY_THRESHOLD
      ? 'certified'
      : 'needs_confirmation'
  );
}

export interface ArtistIdentityQualityMetrics {
  readonly profiles: number;
  readonly byDecision: Readonly<Record<ArtistIdentityDecision, number>>;
  /** certified / profiles with a bound identity; null when there are none. */
  readonly certifiedRate: number | null;
  readonly conflicts: number;
  readonly unverifiedVendorMatches: number;
}

/** Aggregate for Summer; rates are null on an empty denominator, never zero. */
export function summarizeArtistIdentity(
  results: readonly ArtistIdentityConfidence[]
): ArtistIdentityQualityMetrics {
  const byDecision: Record<ArtistIdentityDecision, number> = {
    certified: 0,
    needs_confirmation: 0,
    conflict: 0,
    unbound: 0,
  };
  let unverified = 0;
  for (const result of results) {
    byDecision[result.decision] += 1;
    unverified += result.unverifiedVendorMatches;
  }
  const boundProfiles = results.length - byDecision.unbound;
  return {
    profiles: results.length,
    byDecision,
    certifiedRate: boundProfiles
      ? round(byDecision.certified / boundProfiles)
      : null,
    conflicts: byDecision.conflict,
    unverifiedVendorMatches: unverified,
  };
}
