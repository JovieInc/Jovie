import { z } from 'zod';

export const INVESTOR_UPDATE_RECIPIENT_ROLES = [
  'investor',
  'advisor',
  'founder_self',
  'other_explicit',
] as const;

export const investorUpdateRecipientRoleSchema = z.enum(
  INVESTOR_UPDATE_RECIPIENT_ROLES
);
export type InvestorUpdateRecipientRole = z.infer<
  typeof investorUpdateRecipientRoleSchema
>;

export const investorUpdateCandidateKindSchema = z.enum(['win', 'ask']);
export type InvestorUpdateCandidateKind = z.infer<
  typeof investorUpdateCandidateKindSchema
>;

export const investorUpdateDecisionSchema = z.enum([
  'share',
  'exclude',
  'edit',
]);
export type InvestorUpdateDecision = z.infer<
  typeof investorUpdateDecisionSchema
>;

export const investorContributionKnowledgeSchema = z.enum([
  'known',
  'estimated',
  'unknown',
]);
export type InvestorContributionKnowledge = z.infer<
  typeof investorContributionKnowledgeSchema
>;

export const investorStakeholderRoleSchema = z.enum([
  'investor',
  'advisor',
  'contributor',
  'founder_self',
]);
export type InvestorStakeholderRole = z.infer<
  typeof investorStakeholderRoleSchema
>;

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const investorUpdateCandidateSchema = z
  .object({
    id: z.string().uuid(),
    kind: investorUpdateCandidateKindSchema,
    category: z.string().trim().min(1).max(80),
    metricLabel: z.string().trim().min(1).max(120),
    metricValue: z.string().trim().min(1).max(120),
    metricUnit: z.string().trim().min(1).max(40),
    windowStart: isoDateTimeSchema,
    windowEnd: isoDateTimeSchema,
    sourceRecordId: z.string().uuid(),
    sourceLabel: z.string().trim().min(1).max(160),
    sourceUrl: z.string().url().nullable(),
    sourceObservedAt: isoDateTimeSchema,
    confidence: z.number().min(0).max(1),
    caveats: z.array(z.string().trim().min(1).max(280)).max(8),
    proposedClaim: z.string().trim().min(1).max(800),
    relevanceScore: z.number().min(0).max(1),
    createdAt: isoDateTimeSchema,
  })
  .superRefine((candidate, context) => {
    if (Date.parse(candidate.windowEnd) < Date.parse(candidate.windowStart)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowEnd'],
        message: 'Metric window must end on or after it starts.',
      });
    }
  });
export type InvestorUpdateCandidate = z.infer<
  typeof investorUpdateCandidateSchema
>;

export const investorUpdateCandidateDecisionSchema = z
  .object({
    id: z.string().uuid(),
    candidateId: z.string().uuid(),
    decision: investorUpdateDecisionSchema,
    editedClaim: z.string().trim().min(1).max(800).nullable(),
    decidedByUserId: z.string().trim().min(1),
    decidedAt: isoDateTimeSchema,
  })
  .superRefine((value, context) => {
    const hasEditedClaim = Boolean(value.editedClaim?.trim());
    if (value.decision === 'edit' && !hasEditedClaim) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['editedClaim'],
        message: 'Edit decisions require exact replacement copy.',
      });
    }
    if (value.decision !== 'edit' && value.editedClaim !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['editedClaim'],
        message: 'Only Edit decisions may include replacement copy.',
      });
    }
  });
export type InvestorUpdateCandidateDecision = z.infer<
  typeof investorUpdateCandidateDecisionSchema
>;

export const investorUpdateRecipientSegmentSchema = z
  .object({
    role: investorUpdateRecipientRoleSchema,
    included: z.boolean(),
    recipientCount: z.number().int().min(0).max(100_000),
  })
  .strict()
  .superRefine((segment, context) => {
    if (segment.included && segment.recipientCount < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientCount'],
        message: 'Included roles require an exact non-zero recipient count.',
      });
    }
    if (!segment.included && segment.recipientCount !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientCount'],
        message: 'Excluded roles must have a zero recipient count.',
      });
    }
  });
export type InvestorUpdateRecipientSegment = z.infer<
  typeof investorUpdateRecipientSegmentSchema
>;

export const investorUpdateTrackingSettingsSchema = z
  .object({
    opens: z.boolean().default(false),
    clicks: z.boolean().default(false),
    privacyDisclosureVersion: z.string().trim().min(1).nullable().default(null),
    consentBasis: z.string().trim().min(1).nullable().default(null),
  })
  .strict();
export type InvestorUpdateTrackingSettings = z.infer<
  typeof investorUpdateTrackingSettingsSchema
>;

export const investorUpdateDeliveryEventTypeSchema = z.enum([
  'provider_accepted',
  'delivered',
  'bounced',
  'failed',
]);
export const investorUpdateOpaqueReceiptReferenceSchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    'Receipt references must be opaque identifiers.'
  );
export type InvestorUpdateDeliveryEventType = z.infer<
  typeof investorUpdateDeliveryEventTypeSchema
>;

export const investorStakeholderRecordSchema = z
  .object({
    referenceLabel: z.string().trim().min(1).max(160),
    role: investorStakeholderRoleSchema,
    contributionKnowledge: investorContributionKnowledgeSchema,
    contributionAmountCents: z.number().int().min(0).nullable(),
    contributionCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    contributionSourceRecordId: z.string().uuid().nullable(),
    contributionAsOf: isoDateTimeSchema.nullable(),
  })
  .superRefine((record, context) => {
    const hasAnyObservation =
      record.contributionAmountCents !== null ||
      record.contributionCurrency !== null ||
      record.contributionSourceRecordId !== null ||
      record.contributionAsOf !== null;
    const hasObservation =
      record.contributionAmountCents !== null &&
      record.contributionCurrency !== null &&
      record.contributionSourceRecordId !== null &&
      record.contributionAsOf !== null;

    if (record.contributionKnowledge === 'unknown' && hasAnyObservation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contributionKnowledge'],
        message: 'Unknown contribution records cannot carry an amount.',
      });
    }
    if (record.contributionKnowledge !== 'unknown' && !hasObservation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contributionSourceRecordId'],
        message:
          'Known and estimated contributions require amount, currency, source, and as-of time.',
      });
    }
  });

export interface InvestorUpdateDraftComposition {
  readonly renderedCopy: string;
  readonly includedCandidateIds: readonly string[];
  readonly pendingCandidateIds: readonly string[];
}

export interface InvestorUpdateReviewState {
  readonly draft: {
    readonly id: string;
    readonly periodStart: string;
    readonly subject: string;
    readonly updatedAt: string;
  } | null;
  readonly candidates: readonly (InvestorUpdateCandidate & {
    readonly decision: InvestorUpdateCandidateDecision | null;
  })[];
  readonly composition: InvestorUpdateDraftComposition | null;
  readonly latestApproval: {
    readonly id: string;
    readonly renderedCopy: string;
    readonly copyHash: string;
    readonly recipientSegments: readonly InvestorUpdateRecipientSegment[];
    readonly recipientCount: number;
    readonly approvedAt: string;
    readonly expiresAt: string;
    readonly matchesCurrentDraft: boolean;
  } | null;
  readonly deliveryEvents: readonly {
    readonly id: string;
    readonly eventType: InvestorUpdateDeliveryEventType;
    readonly recipientCount: number;
    readonly externalReference: string;
    readonly occurredAt: string;
  }[];
}

export class InvestorUpdateWorkflowError extends Error {
  constructor(
    readonly code:
      | 'candidate_invalid'
      | 'decision_invalid'
      | 'decisions_incomplete'
      | 'segments_invalid'
      | 'recipient_count_mismatch'
      | 'tracking_unsupported'
      | 'copy_mismatch'
      | 'approval_invalid'
      | 'receipt_outside_approval_window'
      | 'receipt_timing_invalid',
    message: string
  ) {
    super(message);
    this.name = 'InvestorUpdateWorkflowError';
  }
}

function sortCandidates(
  candidates: readonly InvestorUpdateCandidate[]
): InvestorUpdateCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      right.relevanceScore - left.relevanceScore ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
  );
}

export function composeInvestorUpdateDraft(input: {
  readonly subject: string;
  readonly candidates: readonly InvestorUpdateCandidate[];
  readonly decisionsByCandidateId: ReadonlyMap<
    string,
    InvestorUpdateCandidateDecision
  >;
}): InvestorUpdateDraftComposition {
  const subject = input.subject.trim();
  const candidates = sortCandidates(
    input.candidates.map(candidate => {
      const parsed = investorUpdateCandidateSchema.safeParse(candidate);
      if (!parsed.success) {
        throw new InvestorUpdateWorkflowError(
          'candidate_invalid',
          parsed.error.issues[0]?.message ??
            'Invalid investor update candidate.'
        );
      }
      return parsed.data;
    })
  );

  const pendingCandidateIds: string[] = [];
  const includedCandidateIds: string[] = [];
  const wins: string[] = [];
  const asks: string[] = [];

  for (const candidate of candidates) {
    const rawDecision = input.decisionsByCandidateId.get(candidate.id);
    if (!rawDecision) {
      pendingCandidateIds.push(candidate.id);
      continue;
    }
    const parsedDecision =
      investorUpdateCandidateDecisionSchema.safeParse(rawDecision);
    if (!parsedDecision.success) {
      throw new InvestorUpdateWorkflowError(
        'decision_invalid',
        parsedDecision.error.issues[0]?.message ??
          'Invalid investor update decision.'
      );
    }
    if (parsedDecision.data.decision === 'exclude') continue;

    const claim =
      parsedDecision.data.decision === 'edit'
        ? parsedDecision.data.editedClaim
        : candidate.proposedClaim;
    if (!claim) {
      throw new InvestorUpdateWorkflowError(
        'decision_invalid',
        'Included candidates require exact claim copy.'
      );
    }
    includedCandidateIds.push(candidate.id);
    (candidate.kind === 'ask' ? asks : wins).push(`- ${claim}`);
  }

  const sections = [subject];
  if (wins.length > 0) sections.push(`Wins\n${wins.join('\n')}`);
  if (asks.length > 0) sections.push(`Asks\n${asks.join('\n')}`);

  return {
    renderedCopy: sections.join('\n\n'),
    includedCandidateIds,
    pendingCandidateIds,
  };
}

export function validateInvestorUpdateSegments(input: {
  readonly segments: readonly InvestorUpdateRecipientSegment[];
  readonly recipientCount: number;
}): readonly InvestorUpdateRecipientSegment[] {
  const parsedSegments = input.segments.map(segment => {
    const parsed = investorUpdateRecipientSegmentSchema.safeParse(segment);
    if (!parsed.success) {
      throw new InvestorUpdateWorkflowError(
        'segments_invalid',
        parsed.error.issues[0]?.message ?? 'Invalid recipient segment.'
      );
    }
    return parsed.data;
  });
  const roleSet = new Set(parsedSegments.map(segment => segment.role));
  if (
    parsedSegments.length !== INVESTOR_UPDATE_RECIPIENT_ROLES.length ||
    roleSet.size !== INVESTOR_UPDATE_RECIPIENT_ROLES.length ||
    INVESTOR_UPDATE_RECIPIENT_ROLES.some(role => !roleSet.has(role))
  ) {
    throw new InvestorUpdateWorkflowError(
      'segments_invalid',
      'Every recipient role must be explicitly included or excluded exactly once.'
    );
  }
  const calculatedCount = parsedSegments.reduce(
    (total, segment) => total + segment.recipientCount,
    0
  );
  if (calculatedCount !== input.recipientCount) {
    throw new InvestorUpdateWorkflowError(
      'recipient_count_mismatch',
      `Recipient count must equal the explicit segment total (${calculatedCount}).`
    );
  }
  return INVESTOR_UPDATE_RECIPIENT_ROLES.map(
    role => parsedSegments.find(segment => segment.role === role)!
  );
}

export function assertInvestorUpdateTrackingDisabled(
  settings: InvestorUpdateTrackingSettings
): InvestorUpdateTrackingSettings {
  const parsed = investorUpdateTrackingSettingsSchema.parse(settings);
  if (parsed.opens || parsed.clicks) {
    throw new InvestorUpdateWorkflowError(
      'tracking_unsupported',
      'Investor update tracking is unavailable until a consent-aware substrate is approved.'
    );
  }
  return parsed;
}

export function prepareInvestorUpdateFinalApproval(input: {
  readonly subject: string;
  readonly candidates: readonly InvestorUpdateCandidate[];
  readonly decisionsByCandidateId: ReadonlyMap<
    string,
    InvestorUpdateCandidateDecision
  >;
  readonly segments: readonly InvestorUpdateRecipientSegment[];
  readonly recipientCount: number;
  readonly trackingSettings: InvestorUpdateTrackingSettings;
  readonly expectedRenderedCopy: string;
}) {
  const composition = composeInvestorUpdateDraft(input);
  if (composition.pendingCandidateIds.length > 0) {
    throw new InvestorUpdateWorkflowError(
      'decisions_incomplete',
      'Every candidate win and ask requires a founder decision.'
    );
  }
  if (composition.renderedCopy !== input.expectedRenderedCopy) {
    throw new InvestorUpdateWorkflowError(
      'copy_mismatch',
      'Rendered copy changed after review. Review the exact current copy again.'
    );
  }

  return {
    ...composition,
    segments: validateInvestorUpdateSegments(input),
    trackingSettings: assertInvestorUpdateTrackingDisabled(
      input.trackingSettings
    ),
    recipientCount: input.recipientCount,
  };
}

export function serializeInvestorUpdateApprovalSnapshot(input: {
  readonly candidateIds: readonly string[];
  readonly decisionRecordIds: readonly string[];
  readonly renderedCopy: string;
  readonly segments: readonly InvestorUpdateRecipientSegment[];
  readonly recipientCount: number;
  readonly trackingSettings: InvestorUpdateTrackingSettings;
}): string {
  return JSON.stringify({
    candidateIds: [...input.candidateIds].sort(),
    decisionRecordIds: [...input.decisionRecordIds].sort(),
    renderedCopy: input.renderedCopy,
    segments: INVESTOR_UPDATE_RECIPIENT_ROLES.map(role => {
      const segment = input.segments.find(candidate => candidate.role === role);
      if (!segment) {
        throw new InvestorUpdateWorkflowError(
          'segments_invalid',
          'Every recipient role is required in the approval fingerprint.'
        );
      }
      return segment;
    }),
    recipientCount: input.recipientCount,
    trackingSettings: assertInvestorUpdateTrackingDisabled(
      input.trackingSettings
    ),
  });
}

export function assertInvestorUpdateDeliveryEventTiming(input: {
  readonly eventType: InvestorUpdateDeliveryEventType;
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly occurredAt: string;
  readonly observedAt: string;
  readonly providerAcceptedAt?: string | null;
}): void {
  const approvedAt = Date.parse(input.approvedAt);
  const expiresAt = Date.parse(input.expiresAt);
  const occurredAt = Date.parse(input.occurredAt);
  const observedAt = Date.parse(input.observedAt);
  const providerAcceptedAt = input.providerAcceptedAt
    ? Date.parse(input.providerAcceptedAt)
    : null;
  if (
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(occurredAt) ||
    !Number.isFinite(observedAt) ||
    occurredAt < approvedAt ||
    occurredAt > observedAt
  ) {
    throw new InvestorUpdateWorkflowError(
      'receipt_timing_invalid',
      'Delivery observations cannot predate approval or occur in the future.'
    );
  }
  if (input.eventType === 'provider_accepted' && occurredAt > expiresAt) {
    throw new InvestorUpdateWorkflowError(
      'receipt_outside_approval_window',
      'Provider acceptance must occur inside the exact final-approval window.'
    );
  }
  if (input.eventType === 'failed' && providerAcceptedAt === null) {
    if (occurredAt > expiresAt) {
      throw new InvestorUpdateWorkflowError(
        'receipt_outside_approval_window',
        'Pre-acceptance failure must occur inside the final-approval window.'
      );
    }
    return;
  }
  if (
    input.eventType !== 'provider_accepted' &&
    (providerAcceptedAt === null ||
      !Number.isFinite(providerAcceptedAt) ||
      occurredAt < providerAcceptedAt)
  ) {
    throw new InvestorUpdateWorkflowError(
      'receipt_timing_invalid',
      'Delivery and bounce observations require an earlier provider-accepted receipt.'
    );
  }
}
