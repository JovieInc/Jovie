/**
 * JOV-7322 machine pass: certify an outbound prospect from resolved music /
 * social / web evidence BEFORE outreach. Input is the certified evidence
 * envelope produced by the first-party resolver/cache (JOV-6746); this module
 * never calls providers directly. Output is a deterministic verdict that
 * decides human-review queuing and the outreach gate, plus the learning-loop
 * receipts used to recalibrate review scope.
 */

export const PROSPECT_CERTIFICATION_CONTRACT =
  'jovie.prospect-certification/v1' as const;

export const PROSPECT_CERTIFICATION_COVERAGE_FIELDS = [
  'canonical_identity',
  'dsp_catalog',
  'releases',
  'official_socials',
  'official_site',
] as const;
export type ProspectCoverageField =
  (typeof PROSPECT_CERTIFICATION_COVERAGE_FIELDS)[number];

export const PROSPECT_CONTRADICTION_KINDS = [
  'same_name_collision',
  'split_identity',
  'catalog_mismatch',
  'missing_catalog_link',
  'incorrect_catalog_link',
  'stale_destination',
  'broken_destination',
  'social_mismatch',
  'site_mismatch',
] as const;
export type ProspectContradictionKind =
  (typeof PROSPECT_CONTRADICTION_KINDS)[number];

export const PROSPECT_REVIEW_REASONS = [
  'ambiguous_identity',
  'catalog_or_credit',
  'suspicious_social_or_site',
  'material_contradiction',
  'profile_quality',
  'insufficient_coverage',
  'stale_evidence',
] as const;
export type ProspectReviewReason = (typeof PROSPECT_REVIEW_REASONS)[number];

/** Reasons a founder can never ladder out of review; the rest can. */
export const PROSPECT_ALWAYS_REVIEW_REASONS: readonly ProspectReviewReason[] = [
  'material_contradiction',
];

export interface ProspectDspIdentity {
  readonly provider: string;
  readonly artistId: string;
  readonly url: string;
  /** Resolver match score in [0, 1]. */
  readonly matchScore: number;
}

export interface ProspectRelease {
  readonly title: string;
  readonly provider: string;
  readonly url: string;
}

export type ProspectDestinationStatus = 'ok' | 'stale' | 'broken';

export interface ProspectDestination {
  readonly kind: 'official_site' | 'social' | 'dsp' | 'other';
  readonly url: string;
  readonly status: ProspectDestinationStatus;
}

export interface ProspectContradiction {
  readonly kind: ProspectContradictionKind;
  /** Material contradictions block outreach until resolved by a human. */
  readonly material: boolean;
  readonly summary: string;
}

export interface ProspectUnknown {
  readonly field: ProspectCoverageField | string;
  /** Non-material unknowns may remain without blocking outreach. */
  readonly material: boolean;
  readonly note: string;
}

/** Certified evidence envelope for one qualified outbound prospect. */
export interface ProspectResolutionEvidence {
  readonly prospectId: string;
  readonly canonicalArtistName: string;
  /** Resolver identity confidence in [0, 1]. */
  readonly identityConfidence: number;
  readonly dspIdentities: readonly ProspectDspIdentity[];
  readonly releases: readonly ProspectRelease[];
  readonly destinations: readonly ProspectDestination[];
  readonly contradictions: readonly ProspectContradiction[];
  readonly unknowns: readonly ProspectUnknown[];
  /** Machine quality/certification result for the generated public profile. */
  readonly profileQualityPassed: boolean;
  readonly resolverVersion: string;
  readonly providerSources: readonly string[];
  /** ISO timestamp of when the evidence was resolved. */
  readonly observedAt: string;
}

export type ProspectConfidenceTier =
  | 'certified'
  | 'review_required'
  | 'insufficient';

export interface ProspectCertificationPolicy {
  /** Identity confidence at or above this certifies without review. */
  readonly identityCertifiedMin: number;
  /** Below this the machine cannot certify at all. */
  readonly identityReviewMin: number;
  /** Evidence older than this is stale for a campaign. */
  readonly maxEvidenceAgeDays: number;
  /** Coverage fields that must have evidence before outreach. */
  readonly requiredCoverage: readonly ProspectCoverageField[];
  /**
   * Review reasons laddered down to advisory by demonstrated precision.
   * Advisory reasons are recorded but do not queue human review.
   */
  readonly advisoryReviewReasons: readonly ProspectReviewReason[];
}

export const DEFAULT_PROSPECT_CERTIFICATION_POLICY: ProspectCertificationPolicy =
  {
    identityCertifiedMin: 0.9,
    identityReviewMin: 0.65,
    maxEvidenceAgeDays: 30,
    requiredCoverage: ['canonical_identity', 'dsp_catalog'],
    advisoryReviewReasons: [],
  };

export interface ProspectCertificationVerdict {
  readonly contract: typeof PROSPECT_CERTIFICATION_CONTRACT;
  readonly prospectId: string;
  readonly resolverVersion: string;
  readonly tier: ProspectConfidenceTier;
  /** Machine confidence before any human review, in [0, 1]. */
  readonly machineConfidence: number;
  /** Reasons that queue founder review under the current policy. */
  readonly reviewReasons: readonly ProspectReviewReason[];
  /** Reasons observed but laddered down to advisory. */
  readonly advisoryReasons: readonly ProspectReviewReason[];
  readonly materialContradictions: readonly ProspectContradiction[];
  /** Unknowns explicitly recorded as non-material to the promised experience. */
  readonly nonMaterialUnknowns: readonly ProspectUnknown[];
  readonly materialUnknowns: readonly ProspectUnknown[];
  readonly coverage: Readonly<Record<ProspectCoverageField, boolean>>;
  readonly evidenceAgeDays: number;
  readonly requiresHumanReview: boolean;
}

function coveragePresent(
  field: ProspectCoverageField,
  evidence: ProspectResolutionEvidence
): boolean {
  switch (field) {
    case 'canonical_identity':
      return (
        evidence.canonicalArtistName.trim().length > 0 &&
        evidence.identityConfidence > 0
      );
    case 'dsp_catalog':
      return evidence.dspIdentities.length > 0;
    case 'releases':
      return evidence.releases.length > 0;
    case 'official_socials':
      return evidence.destinations.some(item => item.kind === 'social');
    case 'official_site':
      return evidence.destinations.some(item => item.kind === 'official_site');
    default:
      return false;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function evaluateProspectCertification(
  evidence: ProspectResolutionEvidence,
  now: string,
  policy: ProspectCertificationPolicy = DEFAULT_PROSPECT_CERTIFICATION_POLICY
): ProspectCertificationVerdict {
  if (
    !/^[\w:./-]{1,200}$/.test(evidence.resolverVersion) ||
    !Number.isFinite(Date.parse(evidence.observedAt)) ||
    !Number.isFinite(Date.parse(now))
  ) {
    throw new Error('Invalid prospect resolution evidence envelope.');
  }
  const advisory = new Set(policy.advisoryReviewReasons);
  const always = new Set(PROSPECT_ALWAYS_REVIEW_REASONS);
  const reasons = new Set<ProspectReviewReason>();

  const identityConfidence = clamp01(evidence.identityConfidence);
  const dspMean =
    evidence.dspIdentities.length === 0
      ? 0
      : evidence.dspIdentities.reduce(
          (sum, item) => sum + clamp01(item.matchScore),
          0
        ) / evidence.dspIdentities.length;

  const coverage = Object.fromEntries(
    PROSPECT_CERTIFICATION_COVERAGE_FIELDS.map(field => [
      field,
      coveragePresent(field, evidence),
    ])
  ) as Record<ProspectCoverageField, boolean>;

  const materialContradictions = evidence.contradictions.filter(
    item => item.material
  );
  const materialUnknowns = evidence.unknowns.filter(item => item.material);
  const nonMaterialUnknowns = evidence.unknowns.filter(item => !item.material);

  if (identityConfidence < policy.identityCertifiedMin)
    reasons.add('ambiguous_identity');
  if (
    evidence.contradictions.some(item =>
      [
        'catalog_mismatch',
        'missing_catalog_link',
        'incorrect_catalog_link',
        'split_identity',
      ].includes(item.kind)
    ) ||
    materialUnknowns.some(
      item => item.field === 'dsp_catalog' || item.field === 'releases'
    )
  )
    reasons.add('catalog_or_credit');
  if (
    evidence.contradictions.some(item =>
      ['social_mismatch', 'site_mismatch'].includes(item.kind)
    ) ||
    evidence.destinations.some(
      item => item.kind !== 'dsp' && item.status === 'broken'
    )
  )
    reasons.add('suspicious_social_or_site');
  if (materialContradictions.length > 0) reasons.add('material_contradiction');
  if (!evidence.profileQualityPassed) reasons.add('profile_quality');

  const evidenceAgeDays = Math.max(
    0,
    (Date.parse(now) - Date.parse(evidence.observedAt)) / 86_400_000
  );
  if (evidenceAgeDays > policy.maxEvidenceAgeDays)
    reasons.add('stale_evidence');

  if (
    policy.requiredCoverage.some(field => !coverage[field]) ||
    materialUnknowns.length > 0
  )
    reasons.add('insufficient_coverage');

  const reviewReasons = [...reasons]
    .filter(reason => always.has(reason) || !advisory.has(reason))
    .sort();
  const advisoryReasons = [...reasons]
    .filter(reason => !always.has(reason) && advisory.has(reason))
    .sort();

  const machineConfidence = clamp01(
    identityConfidence * 0.6 +
      dspMean * 0.25 +
      (evidence.profileQualityPassed ? 0.15 : 0) -
      materialContradictions.length * 0.2 -
      materialUnknowns.length * 0.1
  );

  const tier: ProspectConfidenceTier =
    identityConfidence < policy.identityReviewMin ||
    !evidence.canonicalArtistName.trim()
      ? 'insufficient'
      : reviewReasons.length === 0
        ? 'certified'
        : 'review_required';

  return {
    contract: PROSPECT_CERTIFICATION_CONTRACT,
    prospectId: evidence.prospectId,
    resolverVersion: evidence.resolverVersion,
    tier,
    machineConfidence,
    reviewReasons,
    advisoryReasons,
    materialContradictions,
    nonMaterialUnknowns,
    materialUnknowns,
    coverage,
    evidenceAgeDays,
    requiresHumanReview:
      tier === 'insufficient' ? true : reviewReasons.length > 0,
  };
}

export const PROSPECT_OUTREACH_BLOCKERS = [
  'identity_not_certified',
  'material_contradiction',
  'profile_quality',
  'human_review_pending',
  'stale_evidence',
] as const;
export type ProspectOutreachBlocker =
  (typeof PROSPECT_OUTREACH_BLOCKERS)[number];

export interface ProspectOutreachGate {
  readonly eligible: boolean;
  readonly blockers: readonly ProspectOutreachBlocker[];
}

/**
 * Outreach eligibility. Unknowns may remain only if explicitly non-material —
 * they never appear in blockers. Material unknowns are already folded into
 * `insufficient_coverage` on the verdict.
 */
export function evaluateProspectOutreachGate(input: {
  readonly verdict: ProspectCertificationVerdict;
  /** Founder review receipt exists when the verdict required review. */
  readonly humanReviewApproved: boolean;
}): ProspectOutreachGate {
  const { verdict } = input;
  const blockers = new Set<ProspectOutreachBlocker>();
  if (verdict.tier === 'insufficient') blockers.add('identity_not_certified');
  if (verdict.materialContradictions.length > 0)
    blockers.add('material_contradiction');
  if (
    verdict.reviewReasons.includes('profile_quality') ||
    verdict.advisoryReasons.includes('profile_quality')
  )
    blockers.add('profile_quality');
  if (verdict.reviewReasons.includes('stale_evidence'))
    blockers.add('stale_evidence');
  if (verdict.requiresHumanReview && !input.humanReviewApproved)
    blockers.add('human_review_pending');
  return { eligible: blockers.size === 0, blockers: [...blockers].sort() };
}

export const PROSPECT_REVIEW_DECISIONS = ['yes', 'no', 'unsure'] as const;
export type ProspectReviewDecision = (typeof PROSPECT_REVIEW_DECISIONS)[number];

export const PROSPECT_FALSE_POSITIVE_TYPES = [
  'same_name_collision',
  'split_identity',
  'catalog_mismatch',
  'social_mismatch',
  'site_mismatch',
  'quality',
  'other',
] as const;
export type ProspectFalsePositiveType =
  (typeof PROSPECT_FALSE_POSITIVE_TYPES)[number];

/** Learning-loop receipt: one founder review decision per verdict. */
export interface ProspectReviewReceipt {
  readonly prospectId: string;
  readonly machineVerdict: ProspectConfidenceTier;
  readonly machineConfidence: number;
  readonly reviewReasons: readonly ProspectReviewReason[];
  readonly decision: ProspectReviewDecision;
  readonly corrections: readonly string[];
  readonly falsePositiveType: ProspectFalsePositiveType | null;
  readonly provider: string | null;
  readonly resolverVersion: string;
  readonly decidedAt: string;
}

export interface ProspectReviewStats {
  readonly total: number;
  /** Machine-vs-human disagreement: 'no' plus corrected 'unsure' verdicts. */
  readonly disagreements: number;
  readonly disagreementRate: number;
  readonly byReason: Readonly<
    Record<ProspectReviewReason, { decided: number; disagreed: number }>
  >;
  readonly falsePositives: Readonly<
    Partial<Record<ProspectFalsePositiveType, number>>
  >;
}

export function summarizeProspectReviewOutcomes(
  receipts: readonly ProspectReviewReceipt[]
): ProspectReviewStats {
  const byReason = Object.fromEntries(
    PROSPECT_REVIEW_REASONS.map(reason => [
      reason,
      { decided: 0, disagreed: 0 },
    ])
  ) as Record<ProspectReviewReason, { decided: number; disagreed: number }>;
  const falsePositives: Partial<Record<ProspectFalsePositiveType, number>> = {};
  let disagreements = 0;
  for (const receipt of receipts) {
    const disagreed =
      receipt.decision === 'no' ||
      (receipt.decision === 'unsure' && receipt.corrections.length > 0);
    if (disagreed) disagreements += 1;
    for (const reason of receipt.reviewReasons) {
      byReason[reason].decided += 1;
      if (disagreed) byReason[reason].disagreed += 1;
    }
    if (receipt.falsePositiveType) {
      falsePositives[receipt.falsePositiveType] =
        (falsePositives[receipt.falsePositiveType] ?? 0) + 1;
    }
  }
  return {
    total: receipts.length,
    disagreements,
    disagreementRate:
      receipts.length === 0 ? 0 : disagreements / receipts.length,
    byReason,
    falsePositives,
  };
}

export const PROSPECT_REVIEW_LADDER = {
  /** Decided reviews per reason before a downgrade is even considered. */
  minDecidedPerReason: 10,
  /** Below this disagreement rate the reason becomes advisory. */
  maxDisagreementRate: 0.05,
} as const;

/**
 * Confidence ladder: shrink founder review scope only where precision is
 * demonstrated. `material_contradiction` and any reason without enough
 * decided receipts stay required. Returns the policy for the next run.
 */
export function deriveProspectReviewPolicy(
  base: ProspectCertificationPolicy,
  stats: ProspectReviewStats
): ProspectCertificationPolicy {
  const advisory = new Set(base.advisoryReviewReasons);
  for (const reason of PROSPECT_REVIEW_REASONS) {
    if (PROSPECT_ALWAYS_REVIEW_REASONS.includes(reason)) continue;
    const bucket = stats.byReason[reason];
    if (
      bucket.decided >= PROSPECT_REVIEW_LADDER.minDecidedPerReason &&
      bucket.disagreed / bucket.decided <=
        PROSPECT_REVIEW_LADDER.maxDisagreementRate
    ) {
      advisory.add(reason);
    }
  }
  return { ...base, advisoryReviewReasons: [...advisory].sort() };
}
