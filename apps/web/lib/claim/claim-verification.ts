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
  readonly now: Date;
}): ClaimVerificationRecord {
  const at = input.now.toISOString();
  return {
    schema: CLAIM_VERIFICATION_SCHEMA,
    status: input.paid ? 'pending_verification' : 'awaiting_payment',
    spotifyArtistId: input.spotifyArtistId,
    artistName: input.artistName?.trim() || null,
    reach: {
      signal: CLAIM_VERIFICATION_REACH_SIGNAL,
      value: input.reach,
      threshold: CLAIM_VERIFICATION_REACH_THRESHOLD,
    },
    requestedAt: at,
    paidAt: input.paid ? at : null,
  };
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
