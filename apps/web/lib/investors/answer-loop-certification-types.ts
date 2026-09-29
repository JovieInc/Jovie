import type {
  AnswerDerivativeContent,
  AnswerReusePack,
  DisclosureScope,
} from './answer-reuse';

export const INVESTOR_ANSWER_FIRST_LOOP_CONTRACT =
  'jovie.investor-answer-first-loop/v1' as const;

export type InvestorQuestionRoute =
  | 'reuse-approved-answer'
  | 'revise-answer'
  | 'new-public-article-or-private-memo'
  | 'proof-experiment'
  | 'fit-constraint';

export interface InvestorQuestionRecord {
  readonly questionId: string;
  readonly tenantId: string;
  readonly relationshipRef: string;
  readonly exactQuestion: string;
  readonly privateIdentityMarkers: readonly string[];
  readonly capturedAt: string;
  readonly source: {
    readonly sourceType: 'manual' | 'authorized-thread' | 'meeting-note';
    readonly sourceEventId: string;
    readonly occurredAt: string;
    readonly provenanceRef: string;
    readonly availability: 'available' | 'deleted-with-tombstone';
    readonly authorization:
      | {
          readonly basis: 'synthetic-fixture';
          readonly fixtureLabel: string;
        }
      | {
          readonly basis: 'permitted-record';
          readonly permissionRef: string;
        };
  };
  readonly privacy: {
    readonly disclosure: 'private-investor';
    readonly publicQuotePermission: boolean;
    readonly trainingPermission: boolean;
    readonly externalSearchPermission: boolean;
    readonly adUsePermission: boolean;
  };
  readonly untrustedContent: true;
  readonly classification: {
    readonly theme: string;
    readonly underlyingConcern: string;
    readonly route: InvestorQuestionRoute;
    readonly evidenceGap: string | null;
    readonly fitConstraint: string | null;
    readonly canonicalAnswerId: string | null;
    readonly canonicalAnswerVersion: string | null;
    readonly matchConfidence: number | null;
    readonly matchRationale: string | null;
    readonly reviewedBy: string;
    readonly reviewedAt: string;
  };
}

export type InvestorClaimStatus =
  | 'verified-fact'
  | 'founder-statement'
  | 'hypothesis'
  | 'forecast'
  | 'current-availability';

export interface InvestorClaimReviewReceipt {
  readonly claimId: string;
  readonly revisionId: string;
  readonly status: InvestorClaimStatus;
  readonly disclosure: DisclosureScope;
  readonly sourceRefs: readonly string[];
  readonly asOf: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly expiresAt: string;
  readonly limitations: readonly string[];
}

export interface InvestorAnswerMaterialReceipt {
  readonly artifactId: string;
  readonly kind: 'public-article' | 'private-memo';
  readonly answerId: string;
  readonly answerVersion: string;
  readonly contentRevision: string;
  readonly disclosure: 'public' | 'private-investor';
  readonly path: string;
  readonly availability: 'reviewed-preview' | 'published';
  readonly content: AnswerDerivativeContent;
  readonly contentHash: string;
  readonly claimReceipts: readonly InvestorClaimReviewReceipt[];
  readonly review: {
    readonly state: 'approved';
    readonly reviewedBy: string;
    readonly reviewedAt: string;
    readonly expiresAt: string;
    readonly approvedContentHash: string;
  };
  readonly releaseApproval?: {
    readonly contentHash: string;
    readonly approvedBy: string;
    readonly approvedAt: string;
    readonly expiresAt: string;
    readonly destination: string;
    readonly allowedAudience: string;
  };
  readonly tracking: {
    readonly opens: false;
    readonly clicks: false;
    readonly advertising: false;
  };
  readonly privateAccess?: {
    readonly relationshipRef: string;
    readonly authorizedAt: string;
    readonly checkedAt: string;
    readonly expiresAt: string;
    readonly revokedAt: string | null;
  };
}

export interface InvestorFollowUp {
  readonly followUpId: string;
  readonly revision: string;
  readonly answerId: string;
  readonly answerVersion: string;
  readonly directAnswer: string;
  readonly body: string;
  readonly senderRef: string;
  readonly recipientRef: string;
  readonly destination: 'email';
  readonly allowedAudience: 'controlled-test' | 'specific-investor';
  readonly disclosure: 'public' | 'private-investor';
  readonly materialLinks: readonly {
    readonly artifactId: string;
    readonly contentRevision: string;
    readonly contentHash: string;
    readonly path: string;
  }[];
  readonly limits: {
    readonly expiresAt: string;
    readonly fundraisingSolicitation: boolean;
    readonly legalReviewRef: string | null;
    readonly opensTracking: false;
    readonly clicksTracking: false;
    readonly advertising: false;
  };
  readonly approval: {
    readonly snapshotHash: string;
    readonly reviewedBy: string;
    readonly reviewedAt: string;
  };
  readonly recipientAuthorization: {
    readonly state: 'authorized' | 'revoked';
    readonly basisRef: string;
    readonly checkedAt: string;
    readonly expiresAt: string;
    readonly revokedAt: string | null;
  };
  readonly suppression: {
    readonly state: 'clear' | 'suppressed';
    readonly checkedAt: string;
  };
}

export type InvestorDeliveryEventType =
  | 'requested'
  | 'provider-accepted'
  | 'delivered'
  | 'ambiguous'
  | 'failed';

export interface InvestorFollowUpDeliveryEvent {
  readonly eventId: string;
  readonly attemptId: string;
  readonly idempotencyKey: string;
  readonly followUpId: string;
  readonly snapshotHash: string;
  readonly senderRef: string;
  readonly recipientRef: string;
  readonly destination: 'email';
  readonly eventType: InvestorDeliveryEventType;
  readonly providerReference: string | null;
  readonly occurredAt: string;
  readonly authorizationState: 'authorized' | 'revoked';
  readonly authorizationCheckedAt: string;
  readonly suppressionState: 'clear' | 'suppressed';
  readonly suppressionCheckedAt: string;
}

export interface InvestorAnswerOutcomeReceipt {
  readonly outcomeId: string;
  readonly type:
    | 'controlled-test-delivered'
    | 'explicit-reply'
    | 'introduction'
    | 'meeting'
    | 'diligence-request'
    | 'decision'
    | 'no-response-yet'
    | 'click';
  readonly actor: 'provider' | 'human' | 'scanner' | 'unknown-bot';
  readonly observedAt: string;
  readonly sourceRef: string;
}

export interface InvestorAnswerFirstLoopEvidence {
  readonly evaluatedAt: string;
  readonly questionId: string;
  readonly questionRecords: readonly InvestorQuestionRecord[];
  readonly answerPack: AnswerReusePack;
  readonly publicArticle: InvestorAnswerMaterialReceipt;
  readonly privateMemo: InvestorAnswerMaterialReceipt;
  readonly followUp: InvestorFollowUp;
  readonly deliveryEvents: readonly InvestorFollowUpDeliveryEvent[];
  readonly outcome: InvestorAnswerOutcomeReceipt;
}

export type InvestorAnswerFirstLoopIssueCode =
  | `question-${'conflict' | 'missing' | 'provenance' | 'permission' | 'privacy' | 'classification'}`
  | `answer-${'invalid' | 'not-approved' | 'binding'}`
  | `material-${'invalid' | 'stale'}`
  | `private-access-${'invalid' | 'revoked'}`
  | `follow-up-${'invalid' | 'stale'}`
  | `recipient-${'unauthorized' | 'suppressed'}`
  | `delivery-${'event-conflict' | 'binding' | 'failed' | 'incomplete'}`
  | 'invalid-time'
  | 'public-private-leak'
  | 'duplicate-send-attempt'
  | 'provider-ambiguous'
  | 'outcome-invalid'
  | 'scanner-intent';

export interface InvestorAnswerFirstLoopIssue {
  readonly code: InvestorAnswerFirstLoopIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface InvestorAnswerFirstLoopCertificationReceipt {
  readonly contract: typeof INVESTOR_ANSWER_FIRST_LOOP_CONTRACT;
  readonly status: 'certified';
  readonly scope: 'synthetic-controlled-test' | 'permitted-question';
  readonly certifiedAt: string;
  readonly evidenceDigest: string;
  readonly questionId: string;
  readonly answerId: string;
  readonly answerVersion: string;
  readonly publicArtifactId: string;
  readonly privateArtifactId: string;
  readonly followUpId: string;
  readonly deliveryAttemptId: string;
  readonly outcomeId: string;
  readonly limitations: readonly string[];
}

export type InvestorAnswerFirstLoopCertification =
  | {
      readonly status: 'blocked';
      readonly issues: readonly InvestorAnswerFirstLoopIssue[];
      readonly receipt: null;
    }
  | {
      readonly status: 'certified';
      readonly issues: readonly [];
      readonly receipt: InvestorAnswerFirstLoopCertificationReceipt;
    };
