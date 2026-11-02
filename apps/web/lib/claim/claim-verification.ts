/**
 * Claim-integrity guard for high-reach artists (taste default, Tim may
 * override; 2026-10-20).
 *
 * Claim proof today is an exact Spotify artist-ID match, so anyone who picks
 * an artist in search could attach that artist's identity to their account.
 * Above a reach threshold the identity is never attached self-serve. The
 * request is stored on the requester's own profile instead:
 *
 *   awaiting_payment ──(checkout.session.completed)──▶ pending_verification
 *   pending_verification ──(operator, follow-up)──▶ verified | rejected
 *
 * Until `verified`, the Spotify identity is not linked to the profile, so no
 * public page, release import or DSP enrichment attributes it to the
 * requester. Payment is never blocked and never grants verification.
 * Below the threshold the self-serve flow is unchanged.
 *
 * Reach signal: Spotify followers. Monthly listeners are not exposed by the
 * Spotify Web API and are not stored anywhere in Jovie (see
 * `post-selection-writing-brief.ts`, always null), so followers are the best
 * signal available at claim time. Unknown reach is not treated as high reach
 * here; callers that must fail closed (the /claim entry) do so explicitly.
 *
 * Pure module: no I/O. Persistence lives in `claim-verification.server.ts`.
 */

/**
 * The one config value. At or above this many Spotify followers, a claim goes
 * to pending verification instead of instant self-serve.
 *
 * Ship now: 50k (taste default; Tim may override). Re-evaluate when
 * pending_verification requests exceed 20 a week or a below-threshold
 * impersonation is reported. Then: automate proof (Spotify for Artists /
 * OAuth) rather than only moving this number.
 */
export const CLAIM_VERIFICATION_REACH_THRESHOLD = 50_000;

export const CLAIM_VERIFICATION_REACH_SIGNAL = 'spotify_followers' as const;

/** Key under `creator_profiles.settings`. */
export const CLAIM_VERIFICATION_SETTINGS_KEY = 'claimVerification' as const;

export const CLAIM_VERIFICATION_SCHEMA = 'jovie-claim-verification/v1' as const;

export const CLAIM_VERIFICATION_STATUSES = [
  'awaiting_payment',
  'pending_verification',
  'verified',
  'rejected',
  /** A counter-claim with at least equal proof: page stays up, frozen. */
  'disputed',
  /** A human decided the page comes down. Never public, for every writer. */
  'taken_down',
] as const;

export type ClaimVerificationStatus =
  (typeof CLAIM_VERIFICATION_STATUSES)[number];

export interface ClaimVerificationRecord {
  readonly schema: typeof CLAIM_VERIFICATION_SCHEMA;
  readonly status: ClaimVerificationStatus;
  readonly spotifyArtistId: string;
  readonly artistName: string | null;
  readonly reach: {
    readonly signal: typeof CLAIM_VERIFICATION_REACH_SIGNAL;
    readonly value: number;
    readonly threshold: number;
  };
  /** Stage timestamps (ISO) so request → paid → decided is measurable. */
  readonly requestedAt: string;
  readonly paidAt: string | null;
  /** Consented funnel journey, when known, so decisions are funnel stages. */
  readonly acquisitionId?: string | null;
  /** Operator decision (verified | rejected). */
  readonly decidedAt?: string | null;
  readonly decidedBy?: string | null;
  readonly decisionReason?: string | null;
  /** Stripe refund id for a rejected, refunded claim. */
  readonly refundId?: string | null;
  /**
   * Free admission: the page stays private until verified. Persisted on the
   * profile so no mutable waitlist field can lose it; the database trigger
   * `creator_profiles_proof_before_public` enforces it for every writer.
   */
  readonly proofOnly?: boolean;
  /** Code the artist places on a page that belongs to their identity. */
  readonly proofCode?: string;
  /** Every automatic check, newest last, capped. Never stores page content. */
  readonly proofAttempts?: readonly ProofAttempt[];
  /** How ownership was proven. Absent on records written before 2026-11. */
  readonly proofMethod?: ProofMethod;
  /** `website_code` counts as strong only on a domain linked from Spotify. */
  readonly proofDomainLinked?: boolean;
  /** When proof verified the claim (ISO), for time-to-verify p50/p95. */
  readonly verifiedAt?: string | null;
  /** Open or decided counter-claim. */
  readonly dispute?: ClaimDispute;
  /** Rejections the artist answered with a new request. */
  readonly reopenCount?: number;
}

export const PROOF_METHODS = [
  'instagram_oauth',
  'youtube_oauth',
  'website_code',
  'dns',
  'domain_email',
  'distributor',
  'operator',
  'legacy',
] as const;

export type ProofMethod = (typeof PROOF_METHODS)[number];

export type ProofStrength = 'strong' | 'weak' | 'legacy';

/**
 * Base strength per method (spec 2026-11-01, section 3). `website_code` is
 * weak here and strong only when the domain is linked from the artist's
 * Spotify profile (see `proofStrength`). `legacy` is a grandfathered profile
 * with no proof at all, so any real proof outranks it.
 */
export const PROOF_STRENGTH: Readonly<Record<ProofMethod, ProofStrength>> = {
  instagram_oauth: 'strong',
  youtube_oauth: 'strong',
  dns: 'strong',
  distributor: 'strong',
  operator: 'strong',
  website_code: 'weak',
  domain_email: 'weak',
  legacy: 'legacy',
};

const PROOF_STRENGTH_RANK: Readonly<Record<ProofStrength, number>> = {
  legacy: 0,
  weak: 1,
  strong: 2,
};

export interface ProofEvidence {
  readonly method: ProofMethod;
  readonly domainLinked?: boolean;
}

export function proofStrength(evidence: ProofEvidence): ProofStrength {
  if (evidence.method === 'website_code' && evidence.domainLinked === true) {
    return 'strong';
  }
  return PROOF_STRENGTH[evidence.method];
}

/** Negative when `a` is weaker than `b`, zero when equal, positive when stronger. */
export function compareProofStrength(
  a: ProofEvidence,
  b: ProofEvidence
): number {
  return (
    PROOF_STRENGTH_RANK[proofStrength(a)] -
    PROOF_STRENGTH_RANK[proofStrength(b)]
  );
}

/**
 * The proof behind a verified record. Records written before proof methods
 * were stored have none: an operator decision (decidedAt set) counts as
 * `operator`, anything else as `legacy`.
 */
export function currentProofEvidence(
  record: ClaimVerificationRecord
): ProofEvidence {
  const method =
    record.proofMethod ?? (record.decidedAt ? 'operator' : 'legacy');
  return { method, domainLinked: record.proofDomainLinked };
}

export type DisputeOutcome = 'keep' | 'transfer' | 'take_down';

export interface ClaimDispute {
  readonly claimantProofMethod: ProofMethod;
  readonly claimantDomainLinked?: boolean;
  readonly openedAt: string;
  readonly outcome?: DisputeOutcome;
  readonly decidedAt?: string;
  readonly decidedBy?: string | null;
}

export type ProofAttemptOutcome =
  | 'matched'
  | 'no_match'
  | 'fetch_failed'
  | 'no_candidate_page'
  | 'blocked_host'
  | 'rate_limited';

export interface ProofAttempt {
  readonly at: string;
  readonly outcome: ProofAttemptOutcome;
  /** Hostname only; never a URL, path or page content. */
  readonly host: string | null;
}

export const PROOF_ATTEMPTS_PER_HOUR = 5;
export const PROOF_ATTEMPTS_KEPT = 30;
export const MAX_PROOF_REOPENS = 3;

export function appendProofAttempt(
  record: ClaimVerificationRecord,
  attempt: ProofAttempt
): ClaimVerificationRecord {
  const attempts = [...(record.proofAttempts ?? []), attempt].slice(
    -PROOF_ATTEMPTS_KEPT
  );
  return { ...record, proofAttempts: attempts };
}

/** Counted attempts in the trailing hour; rate-limited ones do not count. */
export function proofAttemptsInLastHour(
  record: ClaimVerificationRecord,
  now: Date
): number {
  const since = now.getTime() - 3_600_000;
  return (record.proofAttempts ?? []).filter(
    attempt =>
      attempt.outcome !== 'rate_limited' &&
      new Date(attempt.at).getTime() >= since
  ).length;
}

/** High-reach artists are never claimed self-serve. Unknown reach is not high. */
export function requiresClaimVerification(
  reach: number | null | undefined
): reach is number {
  return (
    typeof reach === 'number' &&
    Number.isFinite(reach) &&
    reach >= CLAIM_VERIFICATION_REACH_THRESHOLD
  );
}

export function buildClaimVerificationRequest(input: {
  readonly spotifyArtistId: string;
  readonly artistName: string | null;
  readonly reach: number;
  readonly paid: boolean;
  /**
   * Free-first admission: the page stays private and the request is open for
   * review immediately, with no payment involved (paidAt stays null).
   */
  readonly proofOnly?: boolean;
  /** Generated by the caller (random), so this module stays pure. */
  readonly proofCode?: string;
  readonly now: Date;
}): ClaimVerificationRecord {
  const at = input.now.toISOString();
  return {
    schema: CLAIM_VERIFICATION_SCHEMA,
    status:
      input.paid || input.proofOnly
        ? 'pending_verification'
        : 'awaiting_payment',
    spotifyArtistId: input.spotifyArtistId,
    artistName: input.artistName?.trim() || null,
    reach: {
      signal: CLAIM_VERIFICATION_REACH_SIGNAL,
      value: input.reach,
      threshold: CLAIM_VERIFICATION_REACH_THRESHOLD,
    },
    requestedAt: at,
    paidAt: input.paid ? at : null,
    ...(input.proofOnly
      ? {
          proofOnly: true,
          ...(input.proofCode ? { proofCode: input.proofCode } : {}),
        }
      : {}),
  };
}

/**
 * True while the page must not be public: a free-admission page waiting for
 * (or failed) proof, or any taken-down page. A disputed page was verified and
 * stays up, frozen (`isClaimFrozen`). Mirrors `enforce_proof_before_public()`.
 */
export function isRecordBlockingPublication(
  record: ClaimVerificationRecord | null
): boolean {
  if (!record) return false;
  if (record.status === 'taken_down') return true;
  return (
    record.proofOnly === true &&
    record.status !== 'verified' &&
    record.status !== 'disputed'
  );
}

export function isProofBlockingPublication(settings: unknown): boolean {
  return isRecordBlockingPublication(readClaimVerification(settings));
}

/** Disputed pages stay public but take no owner writes until a human decides. */
export function isClaimFrozen(settings: unknown): boolean {
  return readClaimVerification(settings)?.status === 'disputed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readClaimVerification(
  settings: unknown
): ClaimVerificationRecord | null {
  if (!isRecord(settings)) return null;
  const raw = settings[CLAIM_VERIFICATION_SETTINGS_KEY];
  if (!isRecord(raw) || raw.schema !== CLAIM_VERIFICATION_SCHEMA) return null;
  if (
    !(CLAIM_VERIFICATION_STATUSES as readonly unknown[]).includes(raw.status) ||
    typeof raw.spotifyArtistId !== 'string' ||
    typeof raw.requestedAt !== 'string' ||
    !isRecord(raw.reach)
  ) {
    return null;
  }
  return raw as unknown as ClaimVerificationRecord;
}

/** Open requests hold the identity back; decided ones do not. */
export function isClaimVerificationOpen(
  record: ClaimVerificationRecord | null
): boolean {
  return (
    record?.status === 'awaiting_payment' ||
    record?.status === 'pending_verification'
  );
}

/**
 * Payment transition, applied by the Stripe checkout webhook. Returns null
 * when there is nothing to transition (no request, or already past payment),
 * which keeps webhook retries idempotent.
 */
export function markClaimVerificationPaid(
  record: ClaimVerificationRecord | null,
  paidAt: Date,
  acquisitionId?: string | null
): ClaimVerificationRecord | null {
  if (record?.status !== 'awaiting_payment') return null;
  return {
    ...record,
    status: 'pending_verification',
    paidAt: paidAt.toISOString(),
    acquisitionId: acquisitionId ?? record.acquisitionId ?? null,
  };
}

export type ClaimVerificationDecision = 'approve' | 'reject';

/**
 * Operator transition. Only `pending_verification` can be decided; anything
 * else returns null so a repeated click never re-runs the side effects.
 */
export function decideClaimVerificationRecord(
  record: ClaimVerificationRecord | null,
  input: {
    readonly decision: ClaimVerificationDecision;
    readonly decidedAt: Date;
    readonly decidedBy: string | null;
    readonly reason?: string | null;
    readonly refundId?: string | null;
  }
): ClaimVerificationRecord | null {
  if (record?.status !== 'pending_verification') return null;
  return {
    ...record,
    status: input.decision === 'approve' ? 'verified' : 'rejected',
    decidedAt: input.decidedAt.toISOString(),
    decidedBy: input.decidedBy,
    decisionReason: input.reason?.trim() || null,
    refundId: input.refundId ?? null,
  };
}

/**
 * Automatic proof transition. Only `pending_verification` can be verified,
 * and only by strong proof: weak proof needs a second signal or a human, and
 * `legacy` is not proof. Anything else returns null (idempotent retries).
 */
export function markVerifiedByProof(
  record: ClaimVerificationRecord | null,
  method: ProofMethod,
  at: Date,
  options: { readonly domainLinked?: boolean } = {}
): ClaimVerificationRecord | null {
  if (record?.status !== 'pending_verification') return null;
  if (
    proofStrength({ method, domainLinked: options.domainLinked }) !== 'strong'
  ) {
    return null;
  }
  return {
    ...record,
    status: 'verified',
    proofMethod: method,
    ...(options.domainLinked === undefined
      ? {}
      : { proofDomainLinked: options.domainLinked }),
    verifiedAt: at.toISOString(),
  };
}

/**
 * Counter-claim. Only a verified page can be disputed, and only with proof at
 * least as strong as the current owner's, so a bare claim cannot freeze a real
 * artist. The page stays up, frozen. Returns null otherwise.
 */
export function openDispute(
  record: ClaimVerificationRecord | null,
  input: {
    readonly claimantProofMethod: ProofMethod;
    readonly claimantDomainLinked?: boolean;
    readonly at: Date;
  }
): ClaimVerificationRecord | null {
  if (record?.status !== 'verified') return null;
  if (input.claimantProofMethod === 'legacy') return null;
  const claimant: ProofEvidence = {
    method: input.claimantProofMethod,
    domainLinked: input.claimantDomainLinked,
  };
  if (compareProofStrength(claimant, currentProofEvidence(record)) < 0) {
    return null;
  }
  return {
    ...record,
    status: 'disputed',
    dispute: {
      claimantProofMethod: input.claimantProofMethod,
      ...(input.claimantDomainLinked === undefined
        ? {}
        : { claimantDomainLinked: input.claimantDomainLinked }),
      openedAt: input.at.toISOString(),
    },
  };
}

/**
 * Human decision on an open dispute. `keep` and `transfer` return the page to
 * verified (a transfer carries the claimant's proof; moving ownership is the
 * caller's job), `take_down` removes it. Returns null unless disputed.
 */
export function resolveDispute(
  record: ClaimVerificationRecord | null,
  input: {
    readonly outcome: DisputeOutcome;
    readonly decidedBy: string | null;
    readonly at: Date;
  }
): ClaimVerificationRecord | null {
  if (record?.status !== 'disputed' || !record.dispute) return null;
  const decidedAt = input.at.toISOString();
  const dispute: ClaimDispute = {
    ...record.dispute,
    outcome: input.outcome,
    decidedAt,
    decidedBy: input.decidedBy,
  };
  if (input.outcome === 'take_down') {
    return { ...record, status: 'taken_down', dispute };
  }
  if (input.outcome === 'keep') {
    return { ...record, status: 'verified', dispute };
  }
  return {
    ...record,
    status: 'verified',
    proofMethod: record.dispute.claimantProofMethod,
    proofDomainLinked: record.dispute.claimantDomainLinked === true,
    verifiedAt: decidedAt,
    dispute,
  };
}

export function withClaimVerification(
  settings: unknown,
  record: ClaimVerificationRecord
): Record<string, unknown> {
  return {
    ...(isRecord(settings) ? settings : {}),
    [CLAIM_VERIFICATION_SETTINGS_KEY]: record,
  };
}

export function claimVerificationPendingMessage(
  artistName: string | null | undefined
): string {
  const who = artistName?.trim() || 'This artist';
  return `Verification in progress. ${who} has a large audience, so we confirm ownership before linking the artist to your profile. Your plan and profile work in the meantime, and we'll email you when it's verified.`;
}
