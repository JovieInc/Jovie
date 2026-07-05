import { z } from 'zod';

export const DESIGN_PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;

export const DESIGN_PROPOSAL_REVIEW_DECISIONS = [
  'yes',
  'no',
  'yes-with-notes',
] as const;

export type DesignProposalStatus = (typeof DESIGN_PROPOSAL_STATUSES)[number];

export type DesignProposalReviewDecision =
  (typeof DESIGN_PROPOSAL_REVIEW_DECISIONS)[number];

export const DesignProposalScoringSchema = z
  .object({
    weight: z.number().min(0),
    score: z.number().min(0),
  })
  .strict();

export const DesignProposalSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    surfaceId: z.string().trim().min(1).max(80),
    surfaceName: z.string().trim().min(1).max(120),
    proposalText: z.string().trim().min(1).max(8000),
    assetRefs: z.array(z.string().trim().min(1).max(500)).max(20),
    scoring: DesignProposalScoringSchema.nullable(),
    linearIssueId: z.string().trim().min(1).max(40),
    linearIssueUrl: z.union([z.string().url(), z.null()]),
    status: z.enum(DESIGN_PROPOSAL_STATUSES),
    createdAt: z.string().datetime(),
    reviewedAt: z.union([z.string().datetime(), z.null()]),
    reviewer: z.union([z.string().trim().min(1).max(160), z.null()]),
    reviewNotes: z.union([z.string().trim().max(4000), z.null()]),
    reviewDecision: z
      .union([z.enum(DESIGN_PROPOSAL_REVIEW_DECISIONS), z.null()])
      .optional()
      .transform(value => value ?? null),
    dispatchId: z
      .union([z.string().trim().min(1).max(80), z.null()])
      .optional()
      .transform(value => value ?? null),
    dayBucket: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .transform(value => value ?? null),
  })
  .strict();

export type DesignProposal = z.infer<typeof DesignProposalSchema>;

export const DesignProposalReviewRequestSchema = z
  .object({
    dayBucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    decision: z.enum(DESIGN_PROPOSAL_REVIEW_DECISIONS),
    notes: z.union([z.string().trim().max(4000), z.null()]).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.decision === 'yes-with-notes') {
      const notes = input.notes?.trim() ?? '';
      if (notes.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Notes are required for yes-with-notes decisions.',
          path: ['notes'],
        });
      }
    }

    if (input.decision === 'no' && (input.notes?.trim().length ?? 0) === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rejection direction notes are required for no decisions.',
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
}

export interface ReviewDesignProposalResult {
  readonly proposal: DesignProposal;
  readonly tasteMemoryWritten: boolean;
  readonly linearUpdated: boolean;
  readonly dispatchTriggered: boolean;
  readonly dispatchId: string | null;
}
