import type { evaluateThroughGateway } from '../../../../scripts/invariants/jev-gateway.mjs';

export const MARKETING_SEMANTIC_REVIEW_SCHEMA =
  'marketing-semantic-review/v1' as const;

export const MARKETING_SEMANTIC_CHECKS = [
  'claim-support',
  'section-overlap',
  'cta-expectation',
] as const;
export type MarketingSemanticCheck = (typeof MARKETING_SEMANTIC_CHECKS)[number];

export const MARKETING_SEMANTIC_STAGES = [
  'marketing-claim-support',
  'marketing-section-overlap',
  'marketing-cta-expectation',
] as const;
export type MarketingSemanticStage = (typeof MARKETING_SEMANTIC_STAGES)[number];

export const MARKETING_SEMANTIC_VERDICTS = [
  'supported',
  'contradicted',
  'insufficient',
  'needs-specialist',
] as const;
export type MarketingSemanticVerdict =
  (typeof MARKETING_SEMANTIC_VERDICTS)[number];

export const MARKETING_SEMANTIC_REASON_CODES = [
  'malformed-input',
  'stale-evidence',
  'adversarial-input',
  'sensitive-input',
  'missing-evidence',
  'rendered-evidence-required',
  'reviewer-unavailable',
  'invalid-response',
  'unchanged-evidence',
  'deterministic-overlap',
  'deterministic-destination-mismatch',
  'deterministic-rendered-text-mismatch',
] as const;
export type MarketingSemanticReasonCode =
  (typeof MARKETING_SEMANTIC_REASON_CODES)[number];

export const MARKETING_SEMANTIC_JEV_ROUTE = Object.freeze({
  provider: 'vercel-ai-gateway',
  model: 'typesafe-ai/jev',
});

export interface MarketingSemanticEvidenceItem {
  readonly id: string;
  readonly statement: string;
  readonly digest?: string;
}

export interface MarketingSemanticClaim {
  readonly id: string;
  readonly statement: string;
  readonly renderedText?: string;
  readonly digest?: string;
}

export interface MarketingSemanticSection {
  readonly id: string;
  readonly question: string;
  readonly responsibility: string;
  readonly customerBelief: string;
  readonly newInformation?: string;
  readonly evidenceRefs: readonly string[];
  readonly mustNotRepeat?: readonly string[];
  readonly renderedText?: string;
}

export interface MarketingSemanticCta {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly expectedAction: string;
  readonly eligibility?: string;
  readonly destinationDescription?: string;
  readonly renderedLabel?: string;
  readonly destinationAction?: string;
  readonly destinationEligibility?: string;
}

export interface MarketingSemanticReviewBase {
  readonly check: MarketingSemanticCheck;
  readonly route: string;
  readonly pageId: string;
  readonly audience: string;
  readonly objective: string;
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly currentSourceSha?: string;
  readonly currentArtifactSha256?: string;
  readonly expectedEvidenceFingerprint?: string;
  readonly scope?: string;
}

export interface MarketingClaimSupportReview
  extends MarketingSemanticReviewBase {
  readonly check: 'claim-support';
  readonly claim: MarketingSemanticClaim;
  readonly supportingEvidence: readonly MarketingSemanticEvidenceItem[];
}

export interface MarketingSectionOverlapReview
  extends MarketingSemanticReviewBase {
  readonly check: 'section-overlap';
  readonly sections: readonly MarketingSemanticSection[];
}

export interface MarketingCtaExpectationReview
  extends MarketingSemanticReviewBase {
  readonly check: 'cta-expectation';
  readonly cta: MarketingSemanticCta;
}

export type MarketingSemanticReviewInput =
  | MarketingClaimSupportReview
  | MarketingSectionOverlapReview
  | MarketingCtaExpectationReview;

export interface MarketingSemanticFinding {
  readonly code: string;
  readonly message: string;
  readonly evidenceIds: readonly string[];
}

export interface MarketingSemanticReviewResult {
  readonly schema: typeof MARKETING_SEMANTIC_REVIEW_SCHEMA;
  readonly check: MarketingSemanticCheck | null;
  readonly stage: MarketingSemanticStage | null;
  readonly status: 'evaluated' | 'abstained';
  readonly verdict: MarketingSemanticVerdict;
  readonly abstained: boolean;
  readonly reasonCode: MarketingSemanticReasonCode | null;
  readonly reason: string;
  readonly findings: readonly MarketingSemanticFinding[];
  readonly route: string | null;
  readonly pageId: string | null;
  readonly scope: string | null;
  readonly sourceSha: string | null;
  readonly artifactSha256: string | null;
  readonly evidenceFingerprint: string | null;
  readonly requestFingerprint: string | null;
  readonly transportStatus: string | null;
  readonly model: string | null;
  /** Transport supplied the selected model instance without certifying it. */
  readonly modelIdentityBasis: string | null;
  /** Provider-resolved model/version when independently returned; otherwise null. */
  readonly resolvedModel: string | null;
  readonly advisory: true;
  readonly blocking: false;
  readonly certified: false;
  readonly humanCertified: false;
}

export interface PreparedMarketingSemanticRequest {
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly scope: string;
  readonly stage: MarketingSemanticStage;
  readonly modality: 'text';
  readonly state: string;
  readonly fingerprint: string;
}

export interface MarketingSemanticGatewayOptions {
  readonly approval?: {
    readonly fingerprint: string;
    readonly dataApproved: boolean;
    readonly fundingApproved: boolean;
    readonly expiresAt: number;
    readonly authorityRef: string;
    readonly availableUsd: number;
    readonly maxUsd: number;
    readonly estimatedUpperBoundUsd: number;
  };
  readonly readCurrentFingerprint?: () => string | Promise<string>;
  readonly apiKey?: string;
  readonly signal?: AbortSignal;
  readonly previous?: {
    readonly requestFingerprint?: string;
    readonly status?: string;
  };
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly transport?: typeof evaluateThroughGateway;
}

export interface MarketingSemanticReviewOptions {
  readonly evaluate?: (
    request: PreparedMarketingSemanticRequest
  ) => unknown | Promise<unknown>;
  readonly gateway?: MarketingSemanticGatewayOptions;
}
