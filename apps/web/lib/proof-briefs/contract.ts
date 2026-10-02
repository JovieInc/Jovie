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

/** Audiences a certified brief may be prepared for. */
export const PROOF_BRIEF_AUDIENCES = [
  'investor',
  'customer',
  'manager',
  'founder',
  'internal',
] as const;
export type ProofBriefAudience = (typeof PROOF_BRIEF_AUDIENCES)[number];
export type ProofBriefStatus = 'progress' | 'insufficient-evidence';
export type ProofBriefAttribution = 'execution' | 'observed' | 'causal';
export type ProofBriefEvidenceKind = 'execution' | 'observation' | 'causal';

export interface ProofBriefEvidence {
  readonly id: string;
  readonly kind: ProofBriefEvidenceKind;
  readonly occurredAt: string;
  readonly sourceUrl: string;
  /** What the source proves. Never rendered as customer copy. */
  readonly summary: string;
}

interface ProofBriefClaimBinding {
  readonly attribution: ProofBriefAttribution;
  readonly evidenceIds: readonly string[];
}

/**
 * Product branding carried on the brief so one renderer serves every product
 * in the family (JOV-7220). The adapter picks the brand; renderers never fork.
 */
export interface ProofBriefBrand {
  /** Footer wordmark, e.g. "Jovie" or "LogYourBody". */
  readonly product: string;
  /** Eyebrow line above the window, e.g. "Your week with Jovie". */
  readonly eyebrow: string;
  /** Copy intro for text/email surfaces. */
  readonly intro: string;
  /** Email subject fallback when the hero has no numeric value. */
  readonly recapNoun: string;
}

export const JOVIE_PROOF_BRIEF_BRAND: ProofBriefBrand = {
  product: 'Jovie',
  eyebrow: 'Your week with Jovie',
  intro: "Here's what Jovie did for you in the last 7 days.",
  recapNoun: 'Jovie recap',
} as const;

export const LYB_PROOF_BRIEF_BRAND: ProofBriefBrand = {
  product: 'LogYourBody',
  eyebrow: 'Your progress with LogYourBody',
  intro: "Here's what changed in your LogYourBody measurements.",
  recapNoun: 'LogYourBody progress',
} as const;

export interface ProofBriefWindow {
  /** Inclusive ISO date bounds for the certified window. */
  readonly start: string;
  readonly end: string;
  /** Human display label, e.g. "Sep 15 to Sep 21, 2026". */
  readonly label: string;
}

export interface ProofBriefPoint extends ProofBriefClaimBinding {
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
  readonly status: ProofBriefStatus;
  /** Who the brief is about, e.g. "Tim White". */
  readonly subject: string;
  readonly window: ProofBriefWindow;
  /** Hero claim. `value`/`label` may be absent for a non-numeric hero. */
  readonly hero: ProofBriefClaimBinding & {
    readonly sentence: string;
    readonly value?: string;
    readonly label?: string;
  };
  /** 0–3 supporting proof points. */
  readonly supportingPoints: readonly ProofBriefPoint[];
  /** Receipts that certify every rendered claim. */
  readonly evidence: readonly ProofBriefEvidence[];
  /** Telemetry that was unavailable. Missing data is unknown, never zero. */
  readonly unknowns: readonly string[];
  /** `private` briefs may only render owner-scoped surfaces (email/text). */
  readonly privacy: ProofBriefPrivacy;
  /** ISO timestamp of certification. */
  readonly generatedAt: string;
  /** ISO timestamp after which the snapshot is stale and must not render. */
  readonly expiresAt: string;
  /** Product branding; absent means the Jovie default. */
  readonly brand?: ProofBriefBrand;
  /**
   * Audiences this brief is certified for; absent means subject-scoped
   * recaps only (customer/manager), never investor-facing.
   */
  readonly audiences?: readonly ProofBriefAudience[];
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

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

const REQUIRED_EVIDENCE_KIND: Record<
  ProofBriefAttribution,
  ProofBriefEvidenceKind
> = {
  execution: 'execution',
  observed: 'observation',
  causal: 'causal',
};

function claimIsBound(
  claim: ProofBriefClaimBinding | null | undefined,
  evidenceById: ReadonlyMap<string, ProofBriefEvidence>
): boolean {
  if (
    !claim ||
    !['execution', 'observed', 'causal'].includes(claim.attribution) ||
    !Array.isArray(claim.evidenceIds) ||
    claim.evidenceIds.length === 0
  ) {
    return false;
  }
  const receipts = claim.evidenceIds.map(id => evidenceById.get(id));
  return (
    receipts.every(Boolean) &&
    receipts.some(
      receipt => receipt?.kind === REQUIRED_EVIDENCE_KIND[claim.attribution]
    )
  );
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
  const evidenceById = new Map(
    (Array.isArray(brief?.evidence) ? brief.evidence : []).map(receipt => [
      receipt.id,
      receipt,
    ])
  );
  const evidenceIsValid =
    Array.isArray(brief?.evidence) &&
    brief.evidence.length === evidenceById.size &&
    brief.evidence.every(
      receipt =>
        typeof receipt.id === 'string' &&
        receipt.id.length > 0 &&
        ['execution', 'observation', 'causal'].includes(receipt.kind) &&
        isIsoDate(receipt.occurredAt) &&
        typeof receipt.sourceUrl === 'string' &&
        URL.canParse(receipt.sourceUrl) &&
        typeof receipt.summary === 'string' &&
        receipt.summary.length > 0
    );
  const claimsAreBound =
    brief?.status === 'insufficient-evidence' ||
    (claimIsBound(brief?.hero, evidenceById) &&
      Array.isArray(brief?.supportingPoints) &&
      brief.supportingPoints.every(point => claimIsBound(point, evidenceById)));
  const statusIsValid =
    brief?.status === 'progress' ||
    (brief?.status === 'insufficient-evidence' &&
      Array.isArray(brief?.supportingPoints) &&
      brief.supportingPoints.length === 0 &&
      brief.hero?.value == null &&
      Array.isArray(brief?.unknowns) &&
      brief.unknowns.length > 0);

  if (
    brief?.schema !== PROOF_BRIEF_SCHEMA ||
    typeof brief.briefId !== 'string' ||
    brief.briefId.length === 0 ||
    typeof brief.subject !== 'string' ||
    brief.subject.length === 0 ||
    !Number.isInteger(brief.revision) ||
    brief.revision < 1 ||
    !statusIsValid ||
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
    brief.supportingPoints.length > MAX_SUPPORTING_POINTS ||
    !evidenceIsValid ||
    !Array.isArray(brief.unknowns) ||
    !brief.unknowns.every(
      item => typeof item === 'string' && item.length > 0
    ) ||
    (brief.audiences != null &&
      (!Array.isArray(brief.audiences) ||
        !brief.audiences.every(audience =>
          (PROOF_BRIEF_AUDIENCES as readonly string[]).includes(audience)
        ))) ||
    (brief.brand != null &&
      !['product', 'eyebrow', 'intro', 'recapNoun'].every(
        key =>
          typeof brief.brand?.[key as keyof ProofBriefBrand] === 'string' &&
          (brief.brand[key as keyof ProofBriefBrand] as string).length > 0
      )) ||
    !claimsAreBound
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

/** Brand for a brief; Jovie when the adapter did not set one. */
export function proofBriefBrand(brief: CertifiedProofBrief): ProofBriefBrand {
  return brief.brand ?? JOVIE_PROOF_BRIEF_BRAND;
}
