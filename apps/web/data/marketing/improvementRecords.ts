export const MARKETING_PAGE_IMPROVEMENT_SCHEMA =
  'marketing-page-improvement/v1' as const;
export const MARKETING_TASTE_OUTCOME_SCHEMA =
  'marketing-taste-outcome/v1' as const;
export const MARKETING_SEMANTIC_OUTCOME_SCHEMA =
  'marketing-semantic-outcome/v1' as const;
export const MARKETING_COMMERCIAL_OUTCOME_SCHEMA =
  'marketing-commercial-outcome/v1' as const;

export type MarketingSemanticReviewStatus =
  | 'supported'
  | 'contradicted'
  | 'insufficient'
  | 'needs-specialist'
  | 'unavailable';

/** Structural seam for semanticReview.ts; Jev remains advisory and typed. */
export interface MarketingSemanticReviewLike {
  readonly checkId: string;
  readonly status: MarketingSemanticReviewStatus;
  readonly findings: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly fingerprint: string;
  readonly advisory: true;
  readonly certified: false;
}

export interface MarketingSemanticOutcomeRecord {
  readonly schema: typeof MARKETING_SEMANTIC_OUTCOME_SCHEMA;
  readonly decisionId: string;
  readonly contextDigest: string;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly checkId: string;
  readonly status: MarketingSemanticReviewStatus;
  readonly findings: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly fingerprint: string | null;
  readonly advisory: true;
  readonly certified: false;
}

export type MarketingTasteOutcomeStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'unknown';

export interface MarketingTasteOutcomeRecord {
  readonly schema: typeof MARKETING_TASTE_OUTCOME_SCHEMA;
  readonly decisionId: string;
  readonly contextDigest: string;
  readonly candidateDigest: string;
  readonly status: MarketingTasteOutcomeStatus;
  readonly evidenceRefs: readonly string[];
  readonly reviewer: string | null;
  readonly notes: string | null;
  readonly certified: false;
}

export interface MarketingCommercialOutcomeLink {
  readonly source: 'existing-outcome-loop';
  readonly variantId: string;
  readonly workflowRunId?: string;
  readonly outcomeReceiptId?: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
}

export type MarketingCommercialOutcomeStatus =
  | 'measuring'
  | 'observed-positive'
  | 'observed-zero'
  | 'unknown';

export interface MarketingCommercialOutcomeRecord {
  readonly schema: typeof MARKETING_COMMERCIAL_OUTCOME_SCHEMA;
  readonly decisionId: string;
  readonly contextDigest: string;
  readonly candidateDigest: string;
  readonly status: MarketingCommercialOutcomeStatus;
  readonly link: MarketingCommercialOutcomeLink | null;
  readonly evidenceRefs: readonly string[];
  readonly metrics: Readonly<Record<string, number>> | null;
  readonly certified: false;
}

export interface MarketingImprovementOutcomeBundle {
  readonly taste: MarketingTasteOutcomeRecord;
  readonly semantic: readonly MarketingSemanticOutcomeRecord[];
  readonly commercial: MarketingCommercialOutcomeRecord;
}
