import { createHash } from 'node:crypto';
import { z } from 'zod';

export const DESIGN_LEARNING_LEDGER_SCHEMA_VERSION = 1 as const;

export const DesignLearningStageSchema = z.enum([
  'captured',
  'classified',
  'corroborated',
  'conflict-checked',
  'proposed',
  'accepted',
  'rejected',
  'enforced',
  'expired',
]);

const STAGE_ORDER = [
  'captured',
  'classified',
  'corroborated',
  'conflict-checked',
  'proposed',
  'accepted',
  'rejected',
  'enforced',
  'expired',
] as const;

const StageEventSchema = z
  .object({
    stage: DesignLearningStageSchema,
    at: z.string().datetime(),
    reviewer: z.string().trim().min(1),
  })
  .strict();

const EvidenceSchema = z
  .object({
    kind: z.enum([
      'prompt',
      'transcript',
      'screenshot-before',
      'screenshot-after',
      'semantic-diff',
      'founder-outcome',
      'source-propagation',
      'pen-receipt',
    ]),
    ref: z.string().trim().min(1),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    capturedAt: z.string().datetime(),
  })
  .strict();

const ModelReviewSchema = z
  .object({
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1),
    version: z.string().trim().min(1),
    promptDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    verdict: z.enum(['support', 'oppose', 'abstain']),
    score: z.number().min(0).max(1),
    calibrationVersion: z.string().trim().min(1),
  })
  .strict();

export const DesignLearningEntrySchema = z
  .object({
    schemaVersion: z.literal(DESIGN_LEARNING_LEDGER_SCHEMA_VERSION),
    entryId: z.string().trim().min(1),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    ruleKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    stage: DesignLearningStageSchema,
    stageHistory: z.array(StageEventSchema).min(1),
    authority: z.enum([
      'founder-global',
      'founder-surface',
      'source-registry',
      'candidate',
    ]),
    scope: z.array(z.string().trim().min(1)).min(1),
    confidence: z.number().min(0).max(1),
    statement: z.string().trim().min(1),
    originalPrompt: z.string().trim().min(1),
    transcriptExcerpt: z.string().trim().min(1).nullable(),
    transcriptDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    targetRoot: z.string().trim().min(1),
    componentIdentity: z.string().trim().min(1),
    founderOutcome: z.enum(['lock', 'reject', 'pending']),
    evidence: z.array(EvidenceSchema).min(1),
    evidenceGaps: z.array(z.string().trim().min(1)),
    independentSurfaceKeys: z.array(z.string().trim().min(1)),
    conflictCheck: z
      .object({
        designMdDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        registryDigests: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/)),
        conflicts: z.array(z.string()),
      })
      .strict(),
    modelReviews: z.array(ModelReviewSchema),
    enforcementRefs: z.array(z.string().trim().min(1)),
    rollback: z.string().trim().min(1),
    supersedesEntryId: z.string().trim().min(1).nullable(),
    capturedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.contentHash !== designLearningContentHash(entry)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contentHash'],
        message: 'contentHash does not match the canonical rule payload.',
      });
    }
    const historyIndexes = entry.stageHistory.map(event =>
      STAGE_ORDER.indexOf(event.stage)
    );
    if (entry.stageHistory[0]?.stage !== 'captured') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stageHistory'],
        message: 'Lifecycle history must begin at captured.',
      });
    }
    if (entry.stageHistory.at(-1)?.stage !== entry.stage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stageHistory'],
        message: 'The final lifecycle event must match stage.',
      });
    }
    if (
      historyIndexes.some(
        (value, index) => index > 0 && value < historyIndexes[index - 1]
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stageHistory'],
        message: 'Lifecycle events must be monotonic.',
      });
    }
    const hasFounderGlobalLanguage =
      /\b(?:canonical|always|ban|global)\b|\bmust become\b/i.test(
        `${entry.originalPrompt}\n${entry.statement}`
      );
    const mayPromoteGlobally =
      entry.authority === 'founder-global' &&
      entry.founderOutcome === 'lock' &&
      hasFounderGlobalLanguage;
    const corroborated = new Set(entry.independentSurfaceKeys).size >= 2;
    if (
      ['proposed', 'accepted', 'enforced'].includes(entry.stage) &&
      !mayPromoteGlobally &&
      !corroborated
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Promotion requires explicit founder-global language or two independent surfaces.',
      });
    }
    if (entry.stage === 'enforced' && entry.enforcementRefs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enforced rules require executable enforcement references.',
      });
    }
    if (
      ['conflict-checked', 'proposed', 'accepted', 'enforced'].includes(
        entry.stage
      ) &&
      entry.conflictCheck.conflicts.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unresolved authority conflicts block promotion.',
      });
    }
  });

export type DesignLearningEntry = z.infer<typeof DesignLearningEntrySchema>;

export function designLearningContentHash(input: {
  readonly ruleKey: string;
  readonly statement: string;
  readonly scope: readonly string[];
}): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        ruleKey: input.ruleKey,
        statement: input.statement.trim(),
        scope: [...input.scope].sort(),
      })
    )
    .digest('hex');
  return `sha256:${digest}`;
}

export function appendDesignLearningEntry(
  existing: readonly DesignLearningEntry[],
  candidate: unknown
): readonly DesignLearningEntry[] {
  const entry = DesignLearningEntrySchema.parse(candidate);
  const duplicate = existing.find(
    item =>
      item.entryId === entry.entryId || item.contentHash === entry.contentHash
  );
  if (duplicate) return existing;

  const active = existing.find(
    item =>
      item.ruleKey === entry.ruleKey &&
      ['accepted', 'enforced'].includes(item.stage)
  );
  if (active && entry.supersedesEntryId !== active.entryId) {
    throw new Error(
      `${entry.ruleKey}: replacement must supersede active entry ${active.entryId}`
    );
  }
  return [...existing, entry];
}
