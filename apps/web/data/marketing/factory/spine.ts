/**
 * Factory spine — the one canonical marketing page pipeline.
 *
 * FACTORY_STAGES is the single ordered stage enum. Every earlier stage list
 * (generation.ts MARKETING_GENERATION_STAGES, landingPageGrammar.ts
 * LANDING_PAGE_PIPELINE_STAGES, packages/copy/landing.ts LANDING_STAGES) is a
 * mapped alias of these stages — no fourth stage enum may exist.
 *
 * StageReceiptSchema ('jovie.factory-receipt/v1') is the per-attempt receipt a
 * stage producer emits. It binds input and output artifact digests to the
 * producer identity and to evaluator verdicts whose model family must differ
 * from the producer family. The receipt carries no pass flag: only the
 * harness computes pass/fail (see stageReceiptPassed), so the schema is
 * strict and rejects any `passed` field a producer tries to smuggle in.
 */

import { z } from 'zod';

export const FACTORY_RECEIPT_SCHEMA = 'jovie.factory-receipt/v1' as const;

export const FACTORY_STAGES = [
  'truth',
  'outcomes',
  'narrative',
  'copy',
  'layout',
  'hero-variant',
  'proof',
  'gap-detection',
  'media-decision',
  'ref-sourcing',
  'asset',
  'render',
  'seo-agent',
  'adversarial-trust',
  'publish',
] as const;

export type FactoryStage = (typeof FACTORY_STAGES)[number];

export const FactoryStageSchema = z.enum(FACTORY_STAGES);

/** Repair budget: a stage gets at most three attempts before the run fails. */
export const FACTORY_STAGE_ATTEMPT_LIMIT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Per-stage artifact contracts
// ─────────────────────────────────────────────────────────────────────────────

export const FACTORY_STAGE_ARTIFACT_SCHEMA_IDS: Readonly<
  Record<FactoryStage, string>
> = Object.fromEntries(
  FACTORY_STAGES.map(stage => [stage, `jovie.factory-artifact/${stage}/v1`])
) as Record<FactoryStage, string>;

/**
 * Artifact payload contract per stage. Every artifact declares its schema id;
 * payloads stay loose here and are tightened by the stages that own them.
 */
export const FACTORY_STAGE_ARTIFACT_SCHEMAS: Readonly<
  Record<FactoryStage, z.ZodType<{ schema: string }>>
> = FACTORY_STAGES.reduce(
  (acc, stage) => {
    acc[stage] = z.looseObject({
      schema: z.literal(FACTORY_STAGE_ARTIFACT_SCHEMA_IDS[stage]),
    });
    return acc;
  },
  {} as Record<FactoryStage, z.ZodType<{ schema: string }>>
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage receipt
// ─────────────────────────────────────────────────────────────────────────────

export const FactoryProducerSchema = z.strictObject({
  modelId: z.string().min(1),
  /** Model family; evaluators must come from a different family. */
  family: z.string().min(1),
  /** Routing channel the producer was served on. */
  channel: z.string().min(1),
});

export const FactoryEvaluatorSchema = z.strictObject({
  /** Model family of the evaluator; must differ from the producer family. */
  family: z.string().min(1),
  /** Evaluator kind (rubric, judge, invariant checker, ...). */
  kind: z.string().min(1),
  verdict: z.enum(['pass', 'fail']),
  score: z.number().min(0).max(1),
  rubricVersion: z.string().min(1),
});

export const StageReceiptSchema = z
  .strictObject({
    schema: z.literal(FACTORY_RECEIPT_SCHEMA),
    pageId: z.string().min(1),
    stage: FactoryStageSchema,
    attempt: z.number().int().min(1).max(FACTORY_STAGE_ATTEMPT_LIMIT),
    inputDigest: z.string().min(1),
    outputDigest: z.string().min(1),
    producer: FactoryProducerSchema,
    evaluators: z.array(FactoryEvaluatorSchema),
    invariants: z.strictObject({
      passed: z.array(z.string()),
      failed: z.array(z.string()),
    }),
  })
  .superRefine((receipt, ctx) => {
    for (const evaluator of receipt.evaluators) {
      if (evaluator.family === receipt.producer.family) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Evaluator family must differ from the producer family. A stage cannot grade its own work.',
        });
      }
    }
  });

export type FactoryProducer = z.infer<typeof FactoryProducerSchema>;
export type FactoryEvaluator = z.infer<typeof FactoryEvaluatorSchema>;
export type StageReceipt = z.infer<typeof StageReceiptSchema>;

/**
 * Harness-only verdict. Producers never set `passed` — the schema is strict —
 * so the harness derives it from invariants and evaluator verdicts.
 */
export function stageReceiptPassed(receipt: StageReceipt): boolean {
  return (
    receipt.invariants.failed.length === 0 &&
    receipt.evaluators.every(evaluator => evaluator.verdict === 'pass')
  );
}
