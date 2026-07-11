import { z } from 'zod';

export const DESIGN_PROPOSAL_STATUSES = [
  'proposed',
  'reviewing',
  'approved',
  'rejected',
  'implemented',
] as const;

export const DESIGN_PROPOSAL_KINDS = ['surface', 'section-gap'] as const;
export const DESIGN_PROPOSAL_REVIEW_DECISIONS = [
  'yes',
  'no',
  'yes-with-notes',
] as const;

export type DesignProposalStatus = (typeof DESIGN_PROPOSAL_STATUSES)[number];
export type DesignProposalKind = (typeof DESIGN_PROPOSAL_KINDS)[number];
export type DesignProposalReviewDecision =
  (typeof DESIGN_PROPOSAL_REVIEW_DECISIONS)[number];

const NonEmptyText = z.string().trim().min(1);
const StringList = z.array(NonEmptyText.max(500)).max(50);

export const DesignWireframeSpecSchema = z
  .object({
    viewport: z.enum(['desktop', 'mobile']),
    width: z.number().int().positive(),
    hierarchy: StringList.min(1),
    layout: NonEmptyText.max(2000),
    contentDensity: z.enum(['low', 'medium', 'high']),
    mediaPlacement: NonEmptyText.max(2000),
    responsiveBehavior: NonEmptyText.max(3000),
    interactionModel: NonEmptyText.max(2000),
    tokens: z
      .array(z.enum(['surface', 'border', 'muted', 'foreground']))
      .min(1),
    placeholderContent: z.literal('grayscale-only'),
  })
  .strict();

export const DesignProposalCommentSchema = z
  .object({
    author: NonEmptyText.max(160),
    body: NonEmptyText.max(4000),
    date: NonEmptyText.max(40),
  })
  .strict();
export type DesignProposalComment = z.infer<typeof DesignProposalCommentSchema>;

export const DesignRegistryTaskSchema = z
  .object({
    trigger: z.literal('after-approved'),
    targetSectionId: NonEmptyText.max(120),
    requiredChanges: StringList.min(1),
    exactFiles: StringList.default([]),
    forbiddenPatterns: StringList,
    acceptanceCriteria: StringList.min(1),
    validationCommands: StringList.min(1),
    evidenceRequired: StringList.default([]),
    implementedAt: z.string().datetime().nullable().default(null),
    evidenceRefs: StringList.default([]),
  })
  .strict();

export const DesignModelUsageSchema = z
  .object({
    model: NonEmptyText.max(120),
    role: z.enum(['audit', 'wireframe-spec', 'implementation', 'review']),
    tokens: z.union([
      z.number().int().nonnegative(),
      z.literal('unavailable from runtime'),
    ]),
    estimatedCostUsd: z.union([
      z.number().nonnegative(),
      z.literal('unavailable from runtime'),
    ]),
    estimationBasis: NonEmptyText.max(1000),
  })
  .strict();

const NormalizedDesignGapRecordSchema = z
  .object({
    reviewId: z.string().regex(/^PROPOSED-SECTION-\d{4}$/),
    proposedName: NonEmptyText.max(160),
    problem: NonEmptyText.max(4000),
    affectedRoutes: StringList.min(1),
    audience: NonEmptyText.max(1000),
    conversionGoal: NonEmptyText.max(1000),
    requiredContentFields: StringList,
    requiredMedia: StringList,
    responsiveBehavior: NonEmptyText.max(3000),
    ctaBehavior: NonEmptyText.max(2000),
    similarSections: StringList,
    insufficiencyReason: NonEmptyText.max(3000),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    sectionType: NonEmptyText.max(120),
    wireframes: z
      .object({
        desktop: DesignWireframeSpecSchema,
        mobile: DesignWireframeSpecSchema,
      })
      .strict(),
    openQuestions: StringList,
    comments: z.array(DesignProposalCommentSchema).max(200),
    registryTask: DesignRegistryTaskSchema.nullable(),
    modelUsage: z.array(DesignModelUsageSchema).max(50),
  })
  .strict();

export const DesignGapRecordSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (!('id' in record)) return value;
  return {
    reviewId: record.id,
    proposedName: record.proposedSectionName,
    problem: record.problem,
    affectedRoutes: record.affectedRoutes,
    audience: Array.isArray(record.intendedAudience)
      ? record.intendedAudience.join(', ')
      : record.intendedAudience,
    conversionGoal: record.conversionGoal,
    requiredContentFields: record.requiredContentFields,
    requiredMedia: record.requiredMedia,
    responsiveBehavior: record.proposedResponsiveBehavior,
    ctaBehavior: record.proposedCtaBehavior,
    similarSections: record.similarExistingSections,
    insufficiencyReason: record.existingApprovedVariantInsufficiency,
    priority: record.implementationPriority,
    sectionType: record.sectionType,
    wireframes: record.wireframes,
    openQuestions: record.openDesignQuestions,
    comments: record.comments,
    registryTask: record.registryTask,
    modelUsage: record.modelUsage,
  };
}, NormalizedDesignGapRecordSchema);

export type DesignGapRecord = z.infer<typeof DesignGapRecordSchema>;
export type DesignRegistryTask = z.infer<typeof DesignRegistryTaskSchema>;

export const DesignProposalScoringSchema = z
  .object({
    weight: z.number().min(0),
    score: z.number().min(0),
  })
  .strict();

const ProposalStatusSchema = z.preprocess(
  value => (value === 'pending' ? 'proposed' : value),
  z.enum(DESIGN_PROPOSAL_STATUSES)
);

export const DesignProposalSchema = z
  .object({
    id: NonEmptyText.max(120),
    kind: z.enum(DESIGN_PROPOSAL_KINDS).optional().default('surface'),
    surfaceId: NonEmptyText.max(80),
    surfaceName: NonEmptyText.max(120),
    proposalText: NonEmptyText.max(8000),
    assetRefs: StringList.max(20),
    scoring: DesignProposalScoringSchema.nullable(),
    linearIssueId: NonEmptyText.max(40),
    linearIssueUrl: z.union([z.string().url(), z.null()]),
    status: ProposalStatusSchema,
    designGap: DesignGapRecordSchema.nullable().optional().default(null),
    createdAt: z.string().datetime(),
    reviewedAt: z.union([z.string().datetime(), z.null()]),
    reviewer: z.union([NonEmptyText.max(160), z.null()]),
    reviewNotes: z.union([z.string().trim().max(4000), z.null()]),
    reviewDecision: z
      .union([z.enum(DESIGN_PROPOSAL_REVIEW_DECISIONS), z.null()])
      .optional()
      .transform(value => value ?? null),
    dispatchId: z
      .union([NonEmptyText.max(80), z.null()])
      .optional()
      .transform(value => value ?? null),
    dayBucket: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .transform(value => value ?? null),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (proposal.kind === 'section-gap' && !proposal.designGap) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Section-gap proposals require a designGap record.',
        path: ['designGap'],
      });
    }
    if (proposal.status === 'implemented') {
      const task = proposal.designGap?.registryTask;
      if (!task?.implementedAt || task.evidenceRefs.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Implemented proposals require registry implementation evidence.',
          path: ['designGap', 'registryTask'],
        });
      }
    }
  });

export type DesignProposal = z.infer<typeof DesignProposalSchema>;

export const DesignProposalReviewRequestSchema = z
  .object({
    dayBucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    decision: z.enum(DESIGN_PROPOSAL_REVIEW_DECISIONS),
    notes: z.union([z.string().trim().max(4000), z.null()]).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      (input.decision === 'yes-with-notes' || input.decision === 'no') &&
      (input.notes?.trim().length ?? 0) === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Notes are required for this decision.',
        path: ['notes'],
      });
    }
  });

export type DesignProposalReviewRequest = z.infer<
  typeof DesignProposalReviewRequestSchema
>;

export interface TasteMemoryEntry {
  readonly timestamp: string;
  readonly surfaceId: string;
  readonly surfaceName: string;
  readonly direction: string;
  readonly decision: 'accepted' | 'rejected';
  readonly notes: string | null;
  readonly reviewer: string;
  readonly linearIssueId: string;
}

export interface DesignLabDispatchPayload {
  readonly dispatchId: string;
  readonly proposalId: string;
  readonly surfaceId: string;
  readonly surfaceName: string;
  readonly proposalText: string;
  readonly amendmentNotes: string | null;
  readonly linearIssueId: string;
  readonly linearIssueUrl: string | null;
  readonly tasteMemoryExcerpt: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly registryTask: DesignRegistryTask;
}

export interface ReviewDesignProposalResult {
  readonly proposal: DesignProposal;
  readonly tasteMemoryWritten: boolean;
  readonly linearUpdated: boolean;
  readonly dispatchTriggered: boolean;
  readonly dispatchId: string | null;
}
