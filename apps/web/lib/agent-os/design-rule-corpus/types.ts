import { z } from 'zod';

export const DESIGN_RULE_CORPUS_SCHEMA = 'jovie.design-rule-corpus/v1';

/**
 * Rule classes (JOV-6934 taxonomy). Not every approved design idea is a hard
 * invariant — the class records how much authority an approved rule carries.
 */
export const DESIGN_RULE_CLASSES = [
  'hard-invariant',
  'strong-default',
  'contextual',
  'anti-pattern',
  'taste-preference',
] as const;

export type DesignRuleClass = (typeof DESIGN_RULE_CLASSES)[number];

export const DESIGN_RULE_HIERARCHY_LEVELS = [
  'page',
  'region',
  'organism',
  'molecule',
  'atom',
  'asset',
] as const;

export type DesignRuleHierarchyLevel =
  (typeof DESIGN_RULE_HIERARCHY_LEVELS)[number];

/**
 * How a promoted rule is enforced: `deterministic` rules can be checked by
 * code (lint-style), `visual-semantic` rules need rendered-screenshot
 * judgment, and `taste` rules shape generation but are never objective
 * correctness claims.
 */
export const DESIGN_RULE_ENFORCEMENT_MODES = [
  'deterministic',
  'visual-semantic',
  'taste',
] as const;

export type DesignRuleEnforcementMode =
  (typeof DESIGN_RULE_ENFORCEMENT_MODES)[number];

/**
 * Phase A intake decisions. `contextual` and `modify` preserve the founder's
 * verbatim rationale; `already-covered` dedupes against an existing rule.
 */
export const FOUNDER_RULE_DECISIONS = [
  'accept',
  'reject',
  'modify',
  'contextual',
  'already-covered',
] as const;

export type FounderRuleDecision = (typeof FOUNDER_RULE_DECISIONS)[number];

/** Provenance classes for mined external and internal design canon. */
export const DESIGN_RULE_SOURCE_CLASSES = [
  'apple-hig',
  'nng',
  'design-system',
  'gestalt',
  'ux-law',
  'wcag',
  'editorial',
  'expert-critique',
  'jovie-canon',
  'founder',
] as const;

export type DesignRuleSourceClass = (typeof DESIGN_RULE_SOURCE_CLASSES)[number];

export const DESIGN_RULE_DOMAINS = [
  'grids-alignment',
  'spacing-rhythm',
  'hierarchy-disclosure',
  'typography',
  'color',
  'imagery',
  'surfaces-depth',
  'navigation-overlays',
  'components-states',
  'responsive',
  'motion',
  'iconography-media',
  'content-fit',
  'marketing-composition',
  'accessibility',
  'perceived-quality',
  'subtraction',
  'asset-library',
] as const;

export type DesignRuleDomain = (typeof DESIGN_RULE_DOMAINS)[number];

/**
 * Lifecycle: `candidate` → (Phase A decision) → `accepted` | `rejected` |
 * `contextualized` | `covered` → (Phase B adversarial hardening) →
 * `hardened` → `promoted`. `rejected` is terminal durable negative evidence.
 */
export const DESIGN_RULE_STATUSES = [
  'candidate',
  'accepted',
  'rejected',
  'contextualized',
  'covered',
  'hardened',
  'promoted',
  'superseded',
] as const;

export type DesignRuleStatus = (typeof DESIGN_RULE_STATUSES)[number];

/** Downstream consumers an approved rule is routed to on promotion. */
export const DESIGN_RULE_ROUTES = [
  /** JOV-6039 canonical invariant/certification registry */
  'invariant-registry',
  /** JOV-6040 certified reference/taste corpus */
  'reference-corpus',
  /** JOV-6927 promotion-court evaluator fixtures */
  'promotion-court-fixtures',
  /** JOV-6931 recursive refinement retrieval */
  'refinement-retrieval',
  /** Durable negative preference evidence for rejected rules */
  'negative-evidence',
] as const;

export type DesignRuleRoute = (typeof DESIGN_RULE_ROUTES)[number];

export const DesignRuleSourceSchema = z
  .object({
    class: z.enum(DESIGN_RULE_SOURCE_CLASSES),
    title: z.string().trim().min(1).max(300),
    author: z.union([z.string().trim().min(1).max(200), z.null()]).optional(),
    url: z.union([z.string().url(), z.null()]).optional(),
    note: z.union([z.string().trim().min(1).max(1000), z.null()]).optional(),
  })
  .strict();

export type DesignRuleSource = z.infer<typeof DesignRuleSourceSchema>;

export const RuleFixtureSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    kind: z.enum(['positive', 'negative']),
    description: z.string().trim().min(1).max(2000),
    ref: z.union([z.string().trim().min(1).max(500), z.null()]).optional(),
  })
  .strict();

export type RuleFixture = z.infer<typeof RuleFixtureSchema>;

export const FounderRuleDecisionRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    decision: z.enum(FOUNDER_RULE_DECISIONS),
    reviewer: z.string().trim().min(1).max(160),
    /** Founder's words, verbatim — never rewritten. */
    verbatimRationale: z.string().trim().min(1).max(8000),
    /** Structured interpretation of the rationale; additive only. */
    normalizedRationale: z
      .union([z.string().trim().min(1).max(4000), z.null()])
      .optional(),
    /** Required for `modify`: the founder's replacement statement. */
    modifiedStatement: z
      .union([z.string().trim().min(1).max(4000), z.null()])
      .optional(),
    /** Required for `contextual`: when the rule applies and exceptions. */
    contextClauses: z
      .union([z.array(z.string().trim().min(1).max(1000)).min(1), z.null()])
      .optional(),
    /** Required for `already-covered`: the existing covering rule id. */
    coveredById: z
      .union([z.string().trim().min(1).max(120), z.null()])
      .optional(),
    decidedAt: z.string().datetime(),
  })
  .strict();

export type FounderRuleDecisionRecord = z.infer<
  typeof FounderRuleDecisionRecordSchema
>;

export const SurfaceVerdicts = [
  'better',
  'worse',
  'neutral',
  'brittle',
  'ambiguous',
] as const;

export type SurfaceVerdict = (typeof SurfaceVerdicts)[number];

/** One surface evaluated during Phase B adversarial hardening. */
export const SurfaceEvaluationSchema = z
  .object({
    surfaceId: z.string().trim().min(1).max(200),
    verdict: z.enum(SurfaceVerdicts),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();

export type SurfaceEvaluation = z.infer<typeof SurfaceEvaluationSchema>;

/**
 * Phase B record: an independent adversarial pass that asks what adverse
 * effects the rule would create across high-value current surfaces before
 * the rule can be promoted to an active authority.
 */
export const AdversarialHardeningRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    hardenedBy: z.string().trim().min(1).max(160),
    evaluatedSurfaces: z.array(SurfaceEvaluationSchema).min(1),
    adversarialFindings: z.array(z.string().trim().min(1).max(2000)),
    /** Exceptions added to resolve adverse effects found in hardening. */
    addedExceptions: z.array(z.string().trim().min(1).max(1000)),
    /** Final authority classification after hardening. */
    finalClass: z.enum(DESIGN_RULE_CLASSES),
    hardenedAt: z.string().datetime(),
    notes: z.union([z.string().trim().min(1).max(4000), z.null()]).optional(),
  })
  .strict();

export type AdversarialHardeningRecord = z.infer<
  typeof AdversarialHardeningRecordSchema
>;

export const DesignRuleSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    /** Concise human statement — one atomic decision per rule. */
    statement: z.string().trim().min(1).max(2000),
    /** Normalized machine statement for dedupe/enforcement. */
    normalizedStatement: z.string().trim().min(1).max(4000),
    domain: z.enum(DESIGN_RULE_DOMAINS),
    hierarchyLevel: z.enum(DESIGN_RULE_HIERARCHY_LEVELS),
    /** Proposed class from mining; final authority is set by hardening. */
    proposedClass: z.enum(DESIGN_RULE_CLASSES),
    contexts: z.array(z.string().trim().min(1).max(500)),
    exceptions: z.array(z.string().trim().min(1).max(500)),
    sources: z.array(DesignRuleSourceSchema).min(1),
    /** Ranking inputs, each 0–1: expected leverage, fanout, confidence, novelty. */
    leverage: z.number().min(0).max(1),
    fanout: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    novelty: z.number().min(0).max(1),
    relatedRuleIds: z.array(z.string().trim().min(1).max(120)),
    conflictingRuleIds: z.array(z.string().trim().min(1).max(120)),
    enforcementMode: z.enum(DESIGN_RULE_ENFORCEMENT_MODES),
    fixtures: z.array(RuleFixtureSchema),
    certificationVersion: z
      .union([z.string().trim().min(1).max(40), z.null()])
      .optional(),
    status: z.enum(DESIGN_RULE_STATUSES),
    founderDecision: z.union([FounderRuleDecisionRecordSchema, z.null()]),
    hardening: z.union([AdversarialHardeningRecordSchema, z.null()]),
    /** Final class after hardening; may differ from proposedClass. */
    activeClass: z.union([z.enum(DESIGN_RULE_CLASSES), z.null()]),
    route: z.union([z.enum(DESIGN_RULE_ROUTES), z.null()]),
    proposedAt: z.string().datetime(),
    decidedAt: z.union([z.string().datetime(), z.null()]),
    promotedAt: z.union([z.string().datetime(), z.null()]),
  })
  .strict();

export type DesignRule = z.infer<typeof DesignRuleSchema>;

/** Candidate shape used at ingest time; corpus fills lifecycle fields. */
export const DesignRuleCandidateSchema = DesignRuleSchema.omit({
  normalizedStatement: true,
  status: true,
  founderDecision: true,
  hardening: true,
  activeClass: true,
  route: true,
  decidedAt: true,
  promotedAt: true,
}).extend({
  normalizedStatement: z.string().trim().min(1).max(4000).optional(),
});

export type DesignRuleCandidate = z.infer<typeof DesignRuleCandidateSchema>;

export const DesignRuleCorpusSchema = z
  .object({
    schema: z.literal(DESIGN_RULE_CORPUS_SCHEMA),
    rules: z.record(z.string(), DesignRuleSchema),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type DesignRuleCorpus = z.infer<typeof DesignRuleCorpusSchema>;
