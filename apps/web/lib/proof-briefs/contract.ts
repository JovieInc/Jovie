/**
 * Certified Proof Brief contract (JOV-7217).
 *
 * A proof brief is an immutable, certified snapshot of outcomes over a fixed
 * window. Every rendered surface (image, text, email, social draft) consumes
 * the same briefId + revision + window, so the numbers can never drift
 * between a phone-shareable image and the email that carries it.
 */

export const PROOF_BRIEF_SCHEMA = 'proof-brief/v1' as const;

export const MAX_SUPPORTING_POINTS = 3;

export type ProofBriefPrivacy = 'public' | 'private';

export interface ProofBriefWindow {
  /** Inclusive ISO date bounds for the certified window. */
  readonly start: string;
  readonly end: string;
  /** Human display label, e.g. "Sep 15 – Sep 21, 2026". */
  readonly label: string;
}

export interface ProofBriefPoint {
  /** Display value, e.g. "1,204,318". Optional when the point is qualitative. */
  readonly value?: string;
  readonly label: string;
}

export interface CertifiedProofBrief {
  readonly schema: typeof PROOF_BRIEF_SCHEMA;
  /** Stable identifier shared by every rendered surface. */
  readonly briefId: string;
  /** Evidence revision; surfaces must render the same revision. */
  readonly revision: number;
  /** Who the brief is about, e.g. "Tim White". */
  readonly subject: string;
  readonly window: ProofBriefWindow;
  /** Hero claim. `value`/`label` may be absent for a non-numeric hero. */
  readonly hero: {
    readonly sentence: string;
    readonly value?: string;
    readonly label?: string;
  };
  /** 0–3 supporting proof points. */
  readonly supportingPoints: readonly ProofBriefPoint[];
  /** `private` briefs may only render owner-scoped surfaces (email/text). */
  readonly privacy: ProofBriefPrivacy;
  /** ISO timestamp of certification. */
  readonly generatedAt: string;
  /** ISO timestamp after which the snapshot is stale and must not render. */
  readonly expiresAt: string;
}

export class ProofBriefError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid-brief' | 'stale-brief' | 'privacy-scope'
  ) {
    super(message);
    this.name = 'ProofBriefError';
  }
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * Validate a certified brief for rendering. Fails closed: any contract
 * violation throws ProofBriefError rather than rendering partial facts.
 */
export function assertProofBriefRenderable(
  brief: CertifiedProofBrief,
  options: { readonly now?: Date; readonly requirePublic?: boolean } = {}
): void {
  const now = options.now ?? new Date();

  if (
    brief?.schema !== PROOF_BRIEF_SCHEMA ||
    typeof brief.briefId !== 'string' ||
    brief.briefId.length === 0 ||
    typeof brief.subject !== 'string' ||
    brief.subject.length === 0 ||
    !Number.isInteger(brief.revision) ||
    brief.revision < 1 ||
    !brief.hero ||
    typeof brief.hero.sentence !== 'string' ||
    brief.hero.sentence.length === 0 ||
    !brief.window ||
    !isIsoDate(brief.window.start) ||
    !isIsoDate(brief.window.end) ||
    typeof brief.window.label !== 'string' ||
    brief.window.label.length === 0 ||
    !isIsoDate(brief.generatedAt) ||
    !isIsoDate(brief.expiresAt) ||
    !Array.isArray(brief.supportingPoints) ||
    brief.supportingPoints.length > MAX_SUPPORTING_POINTS
  ) {
    throw new ProofBriefError(
      `Brief ${brief?.briefId ?? '(unknown)'} does not satisfy ${PROOF_BRIEF_SCHEMA}.`,
      'invalid-brief'
    );
  }

  if (Date.parse(brief.expiresAt) <= now.getTime()) {
    throw new ProofBriefError(
      `Brief ${brief.briefId} rev ${brief.revision} expired at ${brief.expiresAt}.`,
      'stale-brief'
    );
  }

  if (options.requirePublic && brief.privacy !== 'public') {
    throw new ProofBriefError(
      `Brief ${brief.briefId} rev ${brief.revision} is ${brief.privacy}-scoped.`,
      'privacy-scope'
    );
  }
}

/** Shared provenance stamp rendered (or asserted) on every surface. */
export function proofBriefProvenance(brief: CertifiedProofBrief): string {
  return `Proof ${brief.briefId} · rev ${brief.revision}`;
}
