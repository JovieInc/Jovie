import type { MarketingImprovementOutcomeBundle, MarketingSemanticOutcomeRecord } from '@/data/marketing/improvement';
import type { MarketingCommercialOutcomeRecord, MarketingTasteOutcomeRecord } from '@/data/marketing/improvementRecords';
import type {
  CertificationReviewPacket,
  FounderCertificationDecision,
} from '@/lib/agent-os/certification';
import type { MarketingCertificationProjectionRow } from '@/lib/agent-os/certification-adapter';
import type { DesignLabDecisionReviewReadyArtifact } from './decision-review';

export const DESIGN_LAB_OUTCOME_LEARNING_SCHEMA =
  'design-lab-outcome-learning/v1' as const;

export type DesignLabCommercialResult =
  | 'positive'
  | 'negative'
  | 'inconclusive'
  | 'unknown';

export type DesignLabOutcomeLearningFailure =
  | 'no-approval'
  | 'invalid-review'
  | 'misbound-reference'
  | 'outcome-unavailable'
  | 'invalid-outcome'
  | 'learning-consumer-unavailable';

export interface DesignLabApprovedFounderReference {
  readonly referenceId: string;
  readonly retrievedFrom: 'marketing-certification-store';
  readonly retrievedAt: string;
  readonly subjectId: string;
  readonly route: string;
  readonly pageId: string;
  readonly contextDigest: string;
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly candidateDigest: string;
  readonly packet: CertificationReviewPacket;
  readonly decision: FounderCertificationDecision;
}

export interface DesignLabApprovedReferenceLookup {
  readonly subjectId: string;
  readonly route: string;
  readonly pageId: string;
  readonly contextDigest: string;
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly candidateDigest: string;
  readonly retrievedAt?: string;
}

export interface DesignLabCommercialOutcomeReceipt {
  readonly receiptId: string;
  readonly sourceRef: string;
  readonly sourceSha: string;
  readonly route: string;
  readonly pageId: string;
  readonly decisionId: string;
  readonly contextDigest: string;
  readonly candidateDigest: string;
  readonly variantId: string;
  readonly workflowRunId?: string | null;
  readonly result: DesignLabCommercialResult;
  readonly observedAt: string;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly evidenceRefs: readonly string[];
  readonly metrics: Readonly<Record<string, number>> | null;
  readonly record: MarketingCommercialOutcomeRecord;
}

export interface DesignLabOutcomeLearningRequest {
  readonly artifact: DesignLabDecisionReviewReadyArtifact;
  readonly subjectId: string;
  readonly approvedReference?: DesignLabApprovedFounderReference | null;
  readonly readApprovedReference?: (
    input: DesignLabApprovedReferenceLookup
  ) =>
    | DesignLabApprovedFounderReference
    | null
    | Promise<DesignLabApprovedFounderReference | null>;
  readonly outcomeReceipt?: DesignLabCommercialOutcomeReceipt | null;
  readonly readOutcomeReceipt?: (input: {
    readonly receiptId: string;
    readonly variantId: string;
    readonly workflowRunId: string | null;
  }) =>
    | DesignLabCommercialOutcomeReceipt
    | null
    | Promise<DesignLabCommercialOutcomeReceipt | null>;
  /** Existing marketing improvement consumer; no consumer means no write. */
  readonly recordOutcomes?: (
    outcomes: MarketingImprovementOutcomeBundle
  ) => void | Promise<void>;
}

export interface DesignLabOutcomeLearningProjection {
  readonly schema: typeof DESIGN_LAB_OUTCOME_LEARNING_SCHEMA;
  readonly reviewId: string;
  readonly artifactDigest: string;
  readonly context: {
    readonly decisionId: string;
    readonly pageId: string;
    readonly route: string;
    readonly contextDigest: string;
    readonly sourceSha: string;
    readonly artifactSha256: string;
    readonly candidateDigest: string;
  };
  readonly approval: {
    readonly referenceId: string;
    readonly subjectId: string;
    readonly decisionId: string;
    readonly decisionEvidenceDigest: string;
    readonly reviewer: string;
    readonly decidedAt: string;
  };
  readonly taste: {
    readonly status: 'approved';
    readonly evidenceRefs: readonly string[];
    readonly reviewer: string;
  };
  readonly semantic: readonly MarketingSemanticOutcomeRecord[];
  readonly commercial: {
    readonly receiptId: string;
    readonly result: DesignLabCommercialResult;
    readonly existingRecordStatus: MarketingCommercialOutcomeRecord['status'];
    readonly variantId: string;
    readonly workflowRunId: string | null;
    readonly sourceRef: string;
    readonly sourceSha: string;
    readonly evidenceRefs: readonly string[];
    readonly metrics: Readonly<Record<string, number>> | null;
    readonly observedAt: string;
    readonly windowStart: string | null;
    readonly windowEnd: string | null;
  };
  readonly recommendation:
    | 'consider-bounded-follow-up'
    | 'retain-incumbent'
    | 'preserve-uncertainty';
  readonly causalStatus: 'unproven';
  readonly certified: false;
  readonly activationTriggered: false;
  readonly experimentActivated: false;
  readonly existingOutcomeConsumer: 'recorded' | 'not-requested';
  readonly learningRefs: readonly string[];
  readonly learningDigest: string;
}

export type DesignLabOutcomeLearningResult =
  | {
      readonly ok: true;
      readonly status: 'admitted';
      readonly projection: DesignLabOutcomeLearningProjection;
    }
  | {
      readonly ok: false;
      readonly status: DesignLabOutcomeLearningFailure;
      readonly reason: string;
      readonly projection: null;
    };

export type DesignLabOutcomeProjectionSource = {
  readonly projection: MarketingCertificationProjectionRow;
  readonly referenceId: string;
  readonly route: string;
  readonly pageId: string;
  readonly contextDigest: string;
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly candidateDigest: string;
  readonly retrievedAt: string;
};

export type { MarketingCommercialOutcomeRecord, MarketingTasteOutcomeRecord };
