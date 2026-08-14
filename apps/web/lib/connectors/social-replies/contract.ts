import { z } from 'zod';

/** Metadata is intentionally opaque to the provider-agnostic engine. */
const metadataSchema = z.record(z.string(), z.unknown());

export const socialReplySourceKindSchema = z.enum([
  'owned-audience',
  'outbound-discovery',
]);

export type SocialReplySourceKind = z.infer<typeof socialReplySourceKindSchema>;

/**
 * A single human-approved draft target. `targetId` identifies the object that
 * will receive the reply; `sourceId` identifies the post/video/thread that
 * gave rise to the opportunity.
 */
export const socialReplyTargetSchema = z.object({
  platform: z.string().trim().min(1).max(64),
  sourceId: z.string().trim().min(1).max(512),
  targetId: z.string().trim().min(1).max(512),
  draftedText: z.string().trim().min(1).max(4_000),
  sourceKind: socialReplySourceKindSchema.default('owned-audience'),
  sourceUrl: z.string().url().nullable().default(null),
  baselineMetadata: metadataSchema.default({}),
});

export type SocialReplyTarget = z.infer<typeof socialReplyTargetSchema>;

export const socialReplyApprovalSchema = z.object({
  approvedBy: z.string().trim().min(1).max(256),
  approvedAt: z.string().datetime(),
  /** Fingerprint of the exact target IDs, destinations, source IDs, and copy. */
  draftFingerprint: z.string().trim().min(1).max(256),
  targetIds: z.array(z.string().trim().min(1).max(512)).min(1),
});

export type SocialReplyApproval = z.infer<typeof socialReplyApprovalSchema>;

export const socialReplyBatchRequestSchema = z
  .object({
    batchId: z.string().trim().min(1).max(256),
    targets: z.array(socialReplyTargetSchema).min(1).max(100),
    mode: z.enum(['draft', 'approved']).default('draft'),
    approval: socialReplyApprovalSchema.optional(),
  })
  .superRefine((request, context) => {
    const targetIds = new Map<string, number>();
    const normalizedTexts = new Map<string, number>();

    for (const [index, target] of request.targets.entries()) {
      const previousTargetIndex = targetIds.get(target.targetId);
      if (previousTargetIndex !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['targets', index, 'targetId'],
          message: `targetId duplicates targets[${previousTargetIndex}]`,
        });
      } else {
        targetIds.set(target.targetId, index);
      }

      const normalizedText = normalizeReplyText(target.draftedText);
      const previousTextIndex = normalizedTexts.get(normalizedText);
      if (previousTextIndex !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['targets', index, 'draftedText'],
          message: `draftedText duplicates targets[${previousTextIndex}] after normalization`,
        });
      } else {
        normalizedTexts.set(normalizedText, index);
      }
    }

    if (request.mode === 'approved' && !request.approval) {
      context.addIssue({
        code: 'custom',
        path: ['approval'],
        message: 'approved mode requires an explicit approval binding',
      });
    }
  });

export type SocialReplyBatchRequest = z.infer<
  typeof socialReplyBatchRequestSchema
>;

export const socialReplyPreflightSchema = z.object({
  isPublic: z.boolean(),
  canReply: z.boolean(),
  existingReplyCount: z.number().int().nonnegative().default(0),
  alreadyReplied: z.boolean().default(false),
  checkedAt: z.string().datetime(),
  baselineMetadata: metadataSchema.default({}),
});

export type SocialReplyPreflight = z.infer<typeof socialReplyPreflightSchema>;

export const socialReplyWriteResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('written'),
    providerReplyId: z.string().trim().min(1),
    providerMetadata: metadataSchema.default({}),
  }),
  z.object({
    status: z.literal('ambiguous'),
    reason: z.string().trim().min(1).max(1_000),
    providerMetadata: metadataSchema.default({}),
  }),
]);

export type SocialReplyWriteResult = z.infer<
  typeof socialReplyWriteResultSchema
>;

export const socialReplyVerificationResultSchema = z.discriminatedUnion(
  'status',
  [
    z.object({
      status: z.literal('verified'),
      providerReplyId: z.string().trim().min(1),
      verifiedText: z.string(),
      verifiedAt: z.string().datetime(),
      providerMetadata: metadataSchema.default({}),
    }),
    z.object({
      status: z.enum(['not-found', 'mismatch', 'ambiguous']),
      reason: z.string().trim().min(1).max(1_000),
      verifiedAt: z.string().datetime(),
      providerMetadata: metadataSchema.default({}),
    }),
  ]
);

export type SocialReplyVerificationResult = z.infer<
  typeof socialReplyVerificationResultSchema
>;

export interface SocialReplyAdapter {
  readonly platform: string;
  preflight(target: SocialReplyTarget): Promise<SocialReplyPreflight>;
  writeReply(target: SocialReplyTarget): Promise<SocialReplyWriteResult>;
  verifyReply(
    target: SocialReplyTarget,
    writeResult: Extract<SocialReplyWriteResult, { status: 'written' }>
  ): Promise<SocialReplyVerificationResult>;
}

export type SocialReplyAdapterRegistry = Readonly<
  Record<string, SocialReplyAdapter>
>;

export const socialReplyItemStatusSchema = z.enum([
  'draft',
  'posted',
  'skipped',
  'failed',
  'ambiguous',
]);

export type SocialReplyItemStatus = z.infer<typeof socialReplyItemStatusSchema>;

export const socialReplySkipReasonSchema = z.enum([
  'not-public',
  'not-replyable',
  'already-replied',
]);

export type SocialReplySkipReason = z.infer<typeof socialReplySkipReasonSchema>;

export const socialReplyFailureReasonSchema = z.enum([
  'approval-mismatch',
  'batch-halted',
  'missing-adapter',
  'adapter-platform-mismatch',
  'preflight-error',
  'invalid-preflight-result',
  'write-error-ambiguous',
  'write-ambiguous',
  'invalid-write-result',
  'verification-error-ambiguous',
  'verification-not-found',
  'verification-mismatch',
  'verification-ambiguous',
  'invalid-verification-result',
]);

export type SocialReplyFailureReason = z.infer<
  typeof socialReplyFailureReasonSchema
>;

export const socialReplyItemReceiptSchema = z.object({
  targetId: z.string(),
  sourceId: z.string(),
  platform: z.string(),
  sourceUrl: z.string().url().nullable(),
  draftedText: z.string(),
  normalizedText: z.string(),
  status: socialReplyItemStatusSchema,
  draftedAt: z.string().datetime(),
  preflight: socialReplyPreflightSchema.nullable(),
  providerReplyId: z.string().nullable(),
  postedAt: z.string().datetime().nullable(),
  verifiedAt: z.string().datetime().nullable(),
  skipReason: socialReplySkipReasonSchema.nullable(),
  failureReason: socialReplyFailureReasonSchema.nullable(),
  failureMessage: z.string().nullable(),
  baselineMetadata: metadataSchema,
  providerMetadata: metadataSchema,
});

export type SocialReplyItemReceipt = z.infer<
  typeof socialReplyItemReceiptSchema
>;

export const socialReplyBatchCountsSchema = z.object({
  drafted: z.number().int().nonnegative(),
  posted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  ambiguous: z.number().int().nonnegative(),
});

export type SocialReplyBatchCounts = z.infer<
  typeof socialReplyBatchCountsSchema
>;

export const socialReplyHaltReasonSchema = z.enum([
  'approval-mismatch',
  'missing-adapter',
  'adapter-platform-mismatch',
  'preflight-error',
  'invalid-preflight-result',
  'write-error-ambiguous',
  'write-ambiguous',
  'invalid-write-result',
  'verification-error-ambiguous',
  'verification-not-found',
  'verification-mismatch',
  'verification-ambiguous',
  'invalid-verification-result',
]);

export type SocialReplyHaltReason = z.infer<typeof socialReplyHaltReasonSchema>;

export const socialReplyBatchReceiptSchema = z.object({
  schemaVersion: z.literal('social-reply-batch/v1'),
  batchId: z.string(),
  mode: z.enum(['draft', 'approved']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  halted: z.boolean(),
  haltReason: socialReplyHaltReasonSchema.nullable(),
  counts: socialReplyBatchCountsSchema,
  items: z.array(socialReplyItemReceiptSchema),
});

export type SocialReplyBatchReceipt = z.infer<
  typeof socialReplyBatchReceiptSchema
>;

export interface SocialReplyBatchOptions {
  /** Default is deliberately conservative for real provider adapters. */
  readonly minDelayMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
}

/**
 * Normalizes only for dedupe and exact-verification comparisons. The original
 * drafted text remains untouched in receipts and is what adapters receive.
 */
export function normalizeReplyText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * Produces a stable, non-secret approval binding for the exact batch copy and
 * destinations. This is an integrity guard, not a cryptographic signature.
 */
export function createReplyBatchFingerprint(
  targets: ReadonlyArray<SocialReplyTarget>
): string {
  const canonical = [...targets]
    .sort((left, right) => left.targetId.localeCompare(right.targetId))
    .map(target =>
      JSON.stringify({
        platform: target.platform,
        sourceId: target.sourceId,
        sourceKind: target.sourceKind,
        sourceUrl: target.sourceUrl,
        targetId: target.targetId,
        draftedText: target.draftedText,
      })
    )
    .join('\n');

  let hash = 0xcbf29ce484222325n;
  for (const codePoint of canonical) {
    hash ^= BigInt(codePoint.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}
