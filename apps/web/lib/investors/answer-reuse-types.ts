export type AnswerClaimKind =
  | 'identity'
  | 'current-availability'
  | 'pricing'
  | 'measured-outcome'
  | 'thesis'
  | 'roadmap';

export type DisclosureScope = 'public' | 'internal' | 'private-investor';
export type DerivativeChannel =
  | 'investor-deck'
  | 'customer-editorial'
  | 'founder-social'
  | 'demo-video'
  | 'recruiting-narrative';
export type DerivativeTreatment =
  | 'investor-context'
  | 'customer-value'
  | 'founder-point-of-view'
  | 'product-demonstration'
  | 'hiring-context';
export type DerivativeReviewState =
  | 'draft'
  | 'approved'
  | 'needs-review'
  | 'rejected'
  | 'withdrawn';
export type DistributionScope =
  | 'public-publishing'
  | 'email-social-sending'
  | 'paid-promotion';
export type ReleaseState =
  | 'candidate'
  | 'published'
  | 'correction-required'
  | 'removed';

/**
 * JOV-5024 claim type: what kind of assertion the exact wording makes.
 * `observed-fact` is measured or directly verifiable; `founder-attested` is a
 * founder-provided account; `hypothesis`, `plan`, and `forecast` are unproven
 * and can never be presented as demonstrated performance.
 */
export type AnswerClaimAssertion =
  | 'observed-fact'
  | 'founder-attested'
  | 'hypothesis'
  | 'plan'
  | 'forecast';

/** Measured claims keep their sample size and denominator attached. */
export interface AnswerClaimCohort {
  readonly label: string;
  readonly sampleSize: number;
  readonly denominator?: string;
}

export interface CanonicalAnswerClaim {
  readonly claimId: string;
  readonly revisionId: string;
  readonly kind: AnswerClaimKind;
  readonly assertion: AnswerClaimAssertion;
  /** The specific subject the claim is about — never a generalized market. */
  readonly subject: string;
  readonly statement: string;
  readonly disclosure: DisclosureScope;
  readonly evidenceQuality: 'canonical' | 'verified' | 'hypothesis';
  readonly evidenceRefs: readonly string[];
  /** Date the underlying evidence was observed. */
  readonly asOf: string;
  /** Accountable reviewer for this exact wording and evidence. */
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  /** Freshness window end; after this the claim is withdrawn from new use. */
  readonly expiresAt?: string;
  readonly limitations: readonly string[];
  /** Required for measured-outcome claims. */
  readonly cohort?: AnswerClaimCohort;
  readonly revisedAt: string;
}

export interface CanonicalAnswer {
  readonly answerId: string;
  readonly version: string;
  readonly directAnswer: string;
  readonly owner: string;
  readonly review: {
    readonly state: 'draft' | 'approved' | 'withdrawn';
    readonly reviewedBy?: string;
    readonly reviewedAt?: string;
    readonly approvalBasis?: string;
  };
  readonly privateContext?: {
    readonly question?: string;
    readonly identities?: readonly string[];
  };
  readonly claims: readonly CanonicalAnswerClaim[];
}

export interface AnswerClaimUse {
  readonly claimId: string;
  readonly revisionId: string;
  /** Changes emphasis, never the source claim or its evidence quality. */
  readonly emphasis: string;
}

export type DistributionDecision =
  | { readonly state: 'not-approved' }
  | {
      readonly state: 'approved';
      readonly approvedBy: string;
      readonly decidedAt: string;
    }
  | {
      readonly state: 'revoked';
      readonly revokedBy: string;
      readonly decidedAt: string;
      readonly reason: string;
      readonly previousApprovedBy: string;
      readonly previousDecidedAt: string;
    };

export interface DistributionApprovals {
  readonly publicPublishing: DistributionDecision;
  readonly emailSocialSending: DistributionDecision;
  readonly paidPromotion: DistributionDecision;
}

export interface AnswerDerivativeContent {
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly {
    readonly heading: string;
    readonly body: string;
  }[];
}

export interface AnswerDerivative {
  readonly derivativeId: string;
  readonly sourceAnswerId: string;
  readonly sourceAnswerVersion: string;
  readonly audience: string;
  readonly purpose: string;
  readonly channel: DerivativeChannel;
  readonly treatment: DerivativeTreatment;
  readonly intendedUse: string;
  readonly nextStep: string;
  readonly successMetric:
    | 'qualified-response'
    | 'customer-comprehension'
    | 'candidate-progression'
    | 'demo-completion';
  readonly claimUses: readonly AnswerClaimUse[];
  readonly disclosure: DisclosureScope;
  readonly owner: string;
  readonly review: {
    readonly state: DerivativeReviewState;
    readonly reviewedBy?: string;
    readonly reviewedAt?: string;
  };
  readonly distribution: DistributionApprovals;
  readonly releaseState: ReleaseState;
  readonly canonicalPath?: string;
  readonly contentRevision: string;
  readonly content: AnswerDerivativeContent;
  readonly usageReceipts: readonly {
    readonly usedAt: string;
    readonly outcome:
      | 'qualified-response'
      | 'customer-understood'
      | 'candidate-advanced'
      | 'demo-completed';
    readonly reference: string;
  }[];
  readonly history: readonly AnswerDerivativeHistory[];
}

export interface AnswerDerivativeHistory {
  readonly event: 'source-change';
  readonly at: string;
  readonly actor: string;
  readonly reason: string;
  readonly fromSourceVersion: string;
  readonly toSourceVersion: string;
  readonly previousReviewState: DerivativeReviewState;
  readonly previousReviewedBy?: string;
  readonly previousReviewedAt?: string;
}

export interface AnswerReusePack {
  readonly sourceAnswer: CanonicalAnswer;
  readonly derivatives: readonly AnswerDerivative[];
}

export interface AnswerReuseValidationIssue {
  readonly derivativeId?: string;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface AnswerReuseValidationOptions {
  /**
   * Explicit evaluation instant for freshness/expiry checks. Callers pass a
   * real timestamp (e.g. deploy or test time); the validator never reads the
   * clock itself.
   */
  readonly evaluatedAt?: string;
}

export interface PublicDiscoveryProjection {
  readonly editorialEntries: readonly {
    readonly derivativeId: string;
    readonly canonicalPath: string;
    readonly title: string;
    readonly summary: string;
    readonly sections: AnswerDerivativeContent['sections'];
    readonly audience: string;
    readonly purpose: string;
    readonly owner: string;
    readonly sourceAnswerId: string;
    readonly sourceAnswerVersion: string;
    readonly claims: readonly CanonicalAnswerClaim[];
    readonly lastModified: string;
  }[];
  readonly sitemapEntries: readonly {
    readonly canonicalPath: string;
    readonly lastModified: string;
  }[];
  readonly agentEntries: readonly {
    readonly canonicalPath: string;
    readonly title: string;
    readonly summary: string;
    readonly sections: AnswerDerivativeContent['sections'];
    readonly claimIds: readonly string[];
    readonly lastModified: string;
  }[];
  readonly rejections: readonly {
    readonly derivativeId: string;
    readonly codes: readonly string[];
  }[];
}

export type AnswerSourceChangeType =
  | 'answer-revision'
  | 'answer-withdrawal'
  | 'claim-evidence-change'
  | 'claim-withdrawal';

export interface AnswerSourceChange {
  readonly type: AnswerSourceChangeType;
  readonly at: string;
  readonly actor: string;
  readonly reason: string;
  readonly changedClaimIds?: readonly string[];
  readonly privacySafeRemovalRequired?: boolean;
}

export interface AnswerSourceChangeResult {
  readonly pack: AnswerReusePack;
  readonly impactedDerivativeIds: readonly string[];
  readonly releaseActions: readonly {
    readonly derivativeId: string;
    readonly action:
      | 'correct-through-existing-release'
      | 'privacy-safe-remove-through-existing-release';
  }[];
}
