/**
 * Marketing page factory: the one stage spine (JOV-7246, epic JOV-7244).
 *
 * FACTORY_STAGES is the only ordered list of marketing page stages. The older
 * lists (generation.ts MARKETING_GENERATION_STAGES, landingPageGrammar.ts
 * LANDING_PAGE_PIPELINE_STAGES, @jovie/copy LANDING_STAGES) stay as they are
 * for their callers and are mapped onto this spine by the alias tables below.
 * A guard test fails when another marketing stage list appears.
 *
 * Every stage run emits a StageReceipt (jovie.factory-receipt/v1). Only the
 * executable harness may mark a receipt passed, mirroring
 * scripts/invariants/run-outcome.mjs, and no LLM or vision evaluator may share
 * a model family with the producer it grades.
 */

import type { LandingStage } from '@jovie/copy';
import { z } from 'zod';
import {
  MarketingBriefSchema,
  MarketingCompositionSchema,
} from '../composition';
import type {
  MarketingGenerationStage,
  MarketingNarrativePlan,
} from '../generation';
import type { LandingPagePipelineStage } from '../landingPageGrammar';
import {
  MarketClassificationSchema,
  PERSUASION_JOB_ROUTES,
  PERSUASION_PRIMITIVES,
} from './persuasionBrief';
import { SectionRequestSchema } from './sectionRequest';

export const FACTORY_SPINE_VERSION = '1.1.0';

export const FACTORY_STAGES = [
  'truth',
  'persuasion',
  'outcomes',
  'narrative',
  'layout',
  'hero-variant',
  'proof',
  'gap-detection',
  'copy',
  'media-decision',
  'ref-sourcing',
  'asset',
  'render',
  'seo-agent',
  'adversarial-trust',
  'publish',
] as const;

export type FactoryStage = (typeof FACTORY_STAGES)[number];

export const FACTORY_STAGE_MAX_ATTEMPTS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Alias tables: existing stage lists projected onto the spine
// ─────────────────────────────────────────────────────────────────────────────

export const MARKETING_GENERATION_STAGE_TO_FACTORY: Readonly<
  Record<MarketingGenerationStage, FactoryStage>
> = {
  truth: 'truth',
  narrative: 'narrative',
  copy: 'copy',
  'section-design': 'layout',
  'asset-generation': 'asset',
  'adversarial-review': 'adversarial-trust',
  'taste-admission': 'adversarial-trust',
};

/**
 * Structural choices precede editorial copy. Legacy generation lists remain
 * projections; this spine is the executable prerequisite order.
 */
export const LANDING_PAGE_PIPELINE_STAGE_TO_FACTORY: Readonly<
  Record<LandingPagePipelineStage, FactoryStage>
> = {
  'classify-intent': 'outcomes',
  'choose-section-jobs': 'narrative',
  'choose-variants': 'layout',
  'fit-copy': 'copy',
  'choose-media-strategy': 'media-decision',
  'render-locked-atoms': 'render',
  'evaluate-composition': 'render',
};

/**
 * @jovie/copy cannot import apps/web, so the copy package keeps its own gate
 * order and this table owns the projection. `style` is art direction on
 * generated assets; `designSystem` is enforced by render-stage invariants.
 */
export const COPY_LANDING_STAGE_TO_FACTORY: Readonly<
  Record<LandingStage, FactoryStage>
> = {
  capabilities: 'truth',
  outcomes: 'outcomes',
  copy: 'copy',
  layout: 'layout',
  style: 'asset',
  designSystem: 'render',
  proof: 'proof',
  social: 'proof',
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-stage artifact schemas
// ─────────────────────────────────────────────────────────────────────────────

const Id = z.string().min(1);
const SectionInstanceId = z.string().min(1);

export const FactoryClaimSetSchema = z.object({
  pageId: Id,
  claims: z
    .array(
      z.object({
        id: Id,
        statement: z.string().min(1),
        maturity: z.enum(['shipped', 'beta', 'waitlist']),
        evidenceRefs: z.array(Id).min(1),
      })
    )
    .min(1),
});

/**
 * The competitive persuasion plan (JOV-7335): which category-standard
 * persuasion jobs the page must still perform and where each routes — a
 * certified section, the section-request pipeline, registry work, or a proof
 * gap. Emitted before composition so render can never run without it.
 */
export const FactoryPersuasionPlanSchema = z.object({
  pageId: Id,
  researchedAt: z.iso.date(),
  classification: MarketClassificationSchema,
  differentiator: Id,
  requiredJobs: z.array(
    z.object({
      primitive: z.enum(PERSUASION_PRIMITIVES),
      job: Id,
      routed: z.enum(PERSUASION_JOB_ROUTES),
    })
  ),
  sectionRequests: z.array(SectionRequestSchema),
  proofGaps: z.array(
    z.object({
      primitive: z.enum(PERSUASION_PRIMITIVES),
      reason: z.string().min(1),
    })
  ),
});

export const FactoryOutcomeBriefSchema = z.object({
  pageId: Id,
  brief: MarketingBriefSchema,
  icp: z.string().min(1),
  jobsToBeDone: z.array(z.string().min(1)).min(1),
  outcomes: z
    .array(
      z.object({
        id: Id,
        statement: z.string().min(1),
        claimIds: z.array(Id).min(1),
      })
    )
    .min(1),
  dataPoints: z
    .array(z.object({ statement: z.string().min(1), sourceRef: Id }))
    .min(3)
    .refine(
      points => new Set(points.map(p => p.statement)).size === points.length,
      'data points must be unique'
    ),
});

export const FactoryNarrativePlanSchema = z.object({
  pageId: Id,
  sections: z
    .array(
      z.object({
        sectionInstanceId: SectionInstanceId,
        sectionId: Id,
        question: z.string().min(1),
        sectionJob: z.string().min(1),
        primaryResponsibility: z.string().min(1),
        newInformation: z.string().min(1),
        customerBelief: z.string().min(1),
        evidenceRefs: z.array(Id),
        mustNotRepeat: z.array(z.string()),
      })
    )
    .min(1),
}) satisfies z.ZodType<MarketingNarrativePlan>;

export const FactoryCopyDocSchema = z.object({
  pageId: Id,
  slots: z
    .array(
      z
        .object({
          sectionInstanceId: SectionInstanceId,
          slot: Id,
          text: z
            .string()
            .min(1)
            .refine(text => !text.includes('—'), 'em dashes are banned'),
          claimIds: z.array(Id),
          nonClaim: z.boolean().default(false),
        })
        .refine(
          slot => slot.nonClaim || slot.claimIds.length > 0,
          'every slot needs a claim id or an explicit nonClaim tag'
        )
    )
    .min(1),
});

export const FactoryLayoutSchema = MarketingCompositionSchema;

/** Locked N8WMP hero variants. qENyP (mobile) is a projection, not a choice. */
export const FACTORY_HERO_VARIANT_IDS = [
  'xm2iz',
  'WQe2p',
  'lnKPH',
  'OxwR1',
  'KhYER',
  'joK4X',
] as const;

export const FactoryHeroChoiceSchema = z.object({
  pageId: Id,
  variantId: z.enum(FACTORY_HERO_VARIANT_IDS),
  headerId: z.literal('eoUUU'),
  headerState: z.enum(['docked', 'scrolled']),
});

const ProofKind = z.enum(['logo', 'quote', 'metric', 'product']);

export const FactoryProofPlanSchema = z.object({
  pageId: Id,
  items: z.array(
    z.object({
      sectionInstanceId: SectionInstanceId,
      kind: ProofKind,
      registryId: Id,
      claimId: Id,
    })
  ),
  requests: z.array(
    z.object({
      sectionInstanceId: SectionInstanceId,
      kind: ProofKind,
      reason: z.string().min(1),
    })
  ),
});

export const FactoryGapReportSchema = z.object({
  pageId: Id,
  sectionRequests: z.array(SectionRequestSchema),
});

/** Owned by factory/mediaDecision.ts, which picks one per section. */
export const FACTORY_MEDIA_KINDS = [
  'product-shot',
  'phone',
  'video',
  'lottie',
  'illustration',
  'photo',
  'callout',
  'table',
  'code',
  'none',
] as const;

/** Shared authoring intent; not evidence that a rendered placement passed. */
export const EditorialMediaIntentSchema = z.object({
  benefit: Id,
  focalDetail: Id,
  rationale: Id,
  fallback: Id,
  alternatives: z
    .array(z.object({ medium: z.enum(FACTORY_MEDIA_KINDS), reason: Id }))
    .min(1),
});
export type EditorialMediaIntent = z.infer<typeof EditorialMediaIntentSchema>;

export const FactoryMediaPlanSchema = z.object({
  pageId: Id,
  sections: z
    .array(
      z.object({
        sectionInstanceId: SectionInstanceId,
        medium: z.enum(FACTORY_MEDIA_KINDS),
        decision: z.enum(['deterministic', 'ambiguous']),
        editorialStatus: z.enum(['authored', 'legacy-unqualified']).optional(),
        editorial: EditorialMediaIntentSchema.optional(),
        reason: z.string().min(1),
      })
    )
    .min(1),
});

export const FactoryRefSetSchema = z.object({
  pageId: Id,
  refs: z.array(
    z.object({
      id: Id,
      sectionInstanceId: SectionInstanceId,
      source: z.string().min(1),
      provenance: z.string().min(1),
      license: z.string().min(1),
    })
  ),
});

export const FactoryAssetManifestSchema = z.object({
  pageId: Id,
  assets: z.array(
    z.object({
      id: Id,
      refIds: z.array(Id),
      path: z.string().min(1),
      mime: z.string().min(1),
      bytes: z.number().int().positive(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      c2paManifestDigest: z.string().min(1).nullable(),
    })
  ),
});

/** One viewport of the render measurer (JOV-7282). */
export const FactoryRenderCaptureSchema = z.object({
  viewport: z.enum(['mobile', 'desktop']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  httpStatus: z.number().int(),
  screenshot: z.object({
    path: z.string().min(1),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  cls: z.number().min(0),
  /** Null when the browser reported no LCP entry; that fails, never passes. */
  lcpMs: z.number().min(0).nullable(),
  domFindings: z.array(
    z.object({
      kind: z.string().min(1),
      message: z.string(),
      elements: z.array(z.string()),
    })
  ),
});

export const FactoryRenderSchema = z.object({
  pageId: Id,
  route: z.string().startsWith('/'),
  cls: z.number().min(0),
  lcpMs: z.number().min(0),
  captures: z.array(FactoryRenderCaptureSchema).optional(),
  /** Exact candidate bytes measured for this attempt; absent on legacy runs. */
  preview: z
    .object({
      path: z.string().min(1),
      digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .optional(),
});

export const FactorySeoAgentSchema = z.object({
  pageId: Id,
  canonical: z.url(),
  title: z.string().min(1),
  description: z.string().min(1),
  jsonLdTypes: z.array(z.string().min(1)).min(1),
  siblingLinks: z.array(z.string().startsWith('/')).min(3).max(5),
  llmsEntry: z.boolean(),
});

export const FactoryTrustScoreSchema = z.object({
  pageId: Id,
  score: z.number().min(0).max(1),
  unsupportedClaims: z.array(z.string().min(1)),
});

export const FACTORY_RAMP_STATES = [
  'shadow',
  'noindex',
  'indexed-cohort',
  'scale',
] as const;

export const FactoryPublishSchema = z.object({
  pageId: Id,
  rampState: z.enum(FACTORY_RAMP_STATES),
  batchId: Id.nullable(),
});

export const FACTORY_STAGE_ARTIFACT_SCHEMAS = {
  truth: FactoryClaimSetSchema,
  persuasion: FactoryPersuasionPlanSchema,
  outcomes: FactoryOutcomeBriefSchema,
  narrative: FactoryNarrativePlanSchema,
  copy: FactoryCopyDocSchema,
  layout: FactoryLayoutSchema,
  'hero-variant': FactoryHeroChoiceSchema,
  proof: FactoryProofPlanSchema,
  'gap-detection': FactoryGapReportSchema,
  'media-decision': FactoryMediaPlanSchema,
  'ref-sourcing': FactoryRefSetSchema,
  asset: FactoryAssetManifestSchema,
  render: FactoryRenderSchema,
  'seo-agent': FactorySeoAgentSchema,
  'adversarial-trust': FactoryTrustScoreSchema,
  publish: FactoryPublishSchema,
} as const satisfies Record<FactoryStage, z.ZodType>;

export type FactoryStageArtifact<S extends FactoryStage> = z.infer<
  (typeof FACTORY_STAGE_ARTIFACT_SCHEMAS)[S]
>;

// ─────────────────────────────────────────────────────────────────────────────
// Stage receipt
// ─────────────────────────────────────────────────────────────────────────────

export const FACTORY_RECEIPT_SCHEMA = 'jovie.factory-receipt/v1' as const;

/** Mirrors CERTIFIER_HARNESS in scripts/invariants/run-outcome.mjs. */
export const FACTORY_CERTIFIER_HARNESS = 'harness' as const;

export const FACTORY_EVALUATOR_KINDS = [
  'deterministic',
  'llm',
  'vision',
  'human',
] as const;

const Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const StageReceiptSchema = z.object({
  schema: z.literal(FACTORY_RECEIPT_SCHEMA),
  pageId: Id,
  stage: z.enum(FACTORY_STAGES),
  attempt: z.number().int().min(1).max(FACTORY_STAGE_MAX_ATTEMPTS),
  inputDigest: Digest,
  outputDigest: Digest,
  /** Null for harness-only stages that have no model producer. */
  producer: z
    .object({
      modelId: Id,
      family: Id,
      channel: z.enum(['ai-gateway', 'subscription-cli', 'harness', 'human']),
    })
    .nullable(),
  evaluators: z.array(
    z.object({
      id: Id,
      family: Id,
      kind: z.enum(FACTORY_EVALUATOR_KINDS),
      verdict: z.enum(['pass', 'revise', 'fail']),
      score: z.number().min(0).max(1),
      rubricVersion: Id,
    })
  ),
  invariantsPassed: z.array(Id),
  invariantsFailed: z.array(Id),
  /** Who set `passed`. Only FACTORY_CERTIFIER_HARNESS may set it true. */
  certifier: Id,
  passed: z.boolean(),
  at: z.iso.datetime(),
});

export type StageReceipt = z.infer<typeof StageReceiptSchema>;

const MODEL_JUDGED_KINDS: ReadonlySet<string> = new Set(['llm', 'vision']);

/** Validates a receipt; returns issues, empty when the receipt is valid. */
export function validateStageReceipt(input: unknown): string[] {
  const parsed = StageReceiptSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      issue => `${issue.path.join('.') || 'receipt'}: ${issue.message}`
    );
  }
  const receipt = parsed.data;
  const issues: string[] = [];

  for (const evaluator of receipt.evaluators) {
    if (
      receipt.producer &&
      MODEL_JUDGED_KINDS.has(evaluator.kind) &&
      evaluator.family === receipt.producer.family
    ) {
      issues.push(
        `evaluator ${evaluator.id} shares family ${evaluator.family} with the producer`
      );
    }
  }

  if (receipt.passed) {
    if (receipt.certifier !== FACTORY_CERTIFIER_HARNESS) {
      issues.push(`only the harness may set passed, got ${receipt.certifier}`);
    }
    if (receipt.invariantsFailed.length > 0) {
      issues.push('passed receipt cannot list failed invariants');
    }
    if (receipt.evaluators.some(evaluator => evaluator.verdict !== 'pass')) {
      issues.push('passed receipt needs a pass verdict from every evaluator');
    }
  }

  return issues;
}

/**
 * The only writable path for `passed`, mirroring applyCertifiedBit in
 * run-outcome.mjs: models always get false, and the harness gets true only
 * when every invariant and evaluator passed and the receipt validates.
 */
export function applyStagePassedBit(
  receipt: Omit<StageReceipt, 'passed' | 'certifier'>,
  context: { readonly certifier: string }
): StageReceipt {
  const passed =
    context.certifier === FACTORY_CERTIFIER_HARNESS &&
    receipt.invariantsFailed.length === 0 &&
    receipt.evaluators.every(evaluator => evaluator.verdict === 'pass');
  const result = { ...receipt, certifier: context.certifier, passed };
  if (passed && validateStageReceipt(result).length > 0) {
    return { ...result, passed: false };
  }
  return result;
}
