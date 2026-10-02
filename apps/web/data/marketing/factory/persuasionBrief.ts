/**
 * Marketing page factory stage 1b: competitive persuasion brief (JOV-7335,
 * epic JOV-7244).
 *
 * Before the factory composes a page it must hold a current, structured
 * competitive persuasion brief: a market/ICP classification, a per-primitive
 * benchmark of what category-leading pages persuade buyers with, and the
 * minimum set of persuasion jobs this page still has to perform. Competitor
 * names and detail stay in the approved private research store (JOV-3241);
 * the brief cites evidence refs and persuasion primitives, never copied copy,
 * claims, layouts or section sequences.
 *
 * Weak or missing jobs become SectionJobNeeds routed through the JOV-7254
 * section-request pipeline; jobs no certified section serves become requests,
 * not invented UI. Required proof-bearing jobs without claim evidence become
 * proof gaps — never fabricated proof. The stage is deterministic: research
 * is authored input, the plan and its failures are derived.
 */

import { z } from 'zod';
import {
  detectSectionGaps,
  type SectionGapReport,
  SectionJobNeedSchema,
} from './sectionRequest';

const Id = z.string().min(1);

/**
 * The persuasion jobs category-leading landing pages perform. A benchmark
 * marks each one for the page being composed; the list is the evaluation
 * contract, not a layout prescription (anti-copy: primitives, not styling).
 */
export const PERSUASION_PRIMITIVES = [
  'outcome-value-prop',
  'product-demo-above-fold',
  'customer-logo-proof',
  'quantified-proof',
  'use-cases',
  'capability-breadth',
  'analytics-insight',
  'integrations',
  'customization-control',
  'performance-reliability',
  'testimonials',
  'pricing-risk-reduction',
  'comparison-differentiation',
  'faq-objections',
  'repeat-cta',
] as const;

export type PersuasionPrimitive = (typeof PERSUASION_PRIMITIVES)[number];

export const PERSUASION_JOB_STATUSES = [
  'strong',
  'weak',
  'missing',
  'unsupported',
  'not-relevant',
] as const;

export type PersuasionJobStatus = (typeof PERSUASION_JOB_STATUSES)[number];

/**
 * Primitives a page may only perform with approved proof behind them. When
 * such a job is required but no claim evidence exists, the plan records a
 * proof gap instead of letting copy invent logos, numbers or quotes.
 */
export const PROOF_BEARING_PRIMITIVES: readonly PersuasionPrimitive[] = [
  'customer-logo-proof',
  'quantified-proof',
  'testimonials',
  'integrations',
  'comparison-differentiation',
];

export const PERSUASION_RESEARCH_MAX_AGE_DAYS = 90;

export const PERSUASION_JOB_ROUTES = [
  'section',
  'section-request',
  'registry-gap',
  'proof-gap',
] as const;

export type PersuasionJobRoute = (typeof PERSUASION_JOB_ROUTES)[number];

export const MarketClassificationSchema = z.object({
  capability: Id,
  buyer: Id,
  /** The buying/use intent this page serves. */
  intent: Id,
  searchIntent: Id,
  /**
   * generic = the product capability page; icp = a scoped projection of a
   * generic capability; category = a genuinely category-specific product.
   */
  pageScope: z.enum(['generic', 'icp', 'category']),
  /** The generic capability an icp page specializes; forbidden on generic. */
  specializes: Id.optional(),
});

export const PersuasionBenchmarkEntrySchema = z.object({
  primitive: z.enum(PERSUASION_PRIMITIVES),
  status: z.enum(PERSUASION_JOB_STATUSES),
  /**
   * The section job a weak/missing primitive needs, routed through
   * detectSectionGaps. Required unless the job routes to a proof gap.
   */
  need: SectionJobNeedSchema.optional(),
  /** Truth-stage claim ids a required proof-bearing job leans on. */
  claimIds: z.array(Id).default([]),
  note: z.string().optional(),
});

export const CompetitiveResearchSchema = z.object({
  classification: MarketClassificationSchema,
  /** When the competitive scan ran; stale research cannot clear the stage. */
  researchedAt: z.iso.date(),
  sources: z
    .array(
      z.object({
        id: Id,
        kind: z.enum(['direct', 'adjacent', 'general-purpose']),
        /** Pointer into the private research/evidence store. */
        evidenceRef: Id,
      })
    )
    .min(1),
  benchmark: z.array(PersuasionBenchmarkEntrySchema).min(1),
  /** The Jovie-native differentiator the anti-copy pass requires. */
  differentiator: Id,
});

export type CompetitiveResearch = z.infer<typeof CompetitiveResearchSchema>;

export interface PersuasionPlanFailure {
  readonly id: string;
  readonly message: string;
}

export interface PersuasionPlan {
  readonly requiredJobs: readonly {
    primitive: PersuasionPrimitive;
    job: string;
    routed: PersuasionJobRoute;
  }[];
  readonly sectionRequests: SectionGapReport['requests'];
  readonly registryGaps: SectionGapReport['registryGaps'];
  readonly proofGaps: readonly {
    primitive: PersuasionPrimitive;
    reason: string;
  }[];
}

const DAY_MS = 86_400_000;

export function persuasionJobToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function isProofBearing(primitive: PersuasionPrimitive): boolean {
  return PROOF_BEARING_PRIMITIVES.includes(primitive);
}

/**
 * Compile the minimum persuasive section plan from the research. Returns the
 * plan plus invariant failures; the stage reports the failures, so a bad
 * brief blocks composition instead of degrading silently.
 */
export function buildPersuasionPlan(input: {
  readonly research: CompetitiveResearch;
  /** The brief's deterministic "today". */
  readonly asOf: string;
}): { plan: PersuasionPlan; failures: PersuasionPlanFailure[] } {
  const research = CompetitiveResearchSchema.parse(input.research);
  const failures: PersuasionPlanFailure[] = [];
  const fail = (id: string, message: string) => failures.push({ id, message });

  const seen = new Map<PersuasionPrimitive, number>();
  for (const entry of research.benchmark) {
    seen.set(entry.primitive, (seen.get(entry.primitive) ?? 0) + 1);
  }
  const missing = PERSUASION_PRIMITIVES.filter(
    primitive => !seen.has(primitive)
  );
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
  if (missing.length > 0 || duplicated.length > 0) {
    fail(
      'benchmark-complete',
      `benchmark must mark every primitive exactly once; missing: ${missing.join(', ') || 'none'}; duplicated: ${duplicated.map(([p]) => p).join(', ') || 'none'}`
    );
  }

  const researchedAt = Date.parse(research.researchedAt);
  const asOf = Date.parse(input.asOf);
  if (
    !(researchedAt <= asOf) ||
    asOf - researchedAt > PERSUASION_RESEARCH_MAX_AGE_DAYS * DAY_MS
  ) {
    fail(
      'research-fresh',
      `researchedAt ${research.researchedAt} must be on or before asOf ${input.asOf} and within ${PERSUASION_RESEARCH_MAX_AGE_DAYS} days of it`
    );
  }

  if (new Set(research.sources.map(source => source.kind)).size < 2) {
    fail(
      'research-breadth',
      'the scan needs at least two source kinds (direct, adjacent, general-purpose)'
    );
  }

  const { pageScope, specializes } = research.classification;
  if (pageScope === 'icp' && !specializes) {
    fail(
      'taxonomy-scope',
      'an icp page must name the generic capability it specializes'
    );
  }
  if (pageScope === 'generic' && specializes) {
    fail(
      'taxonomy-scope',
      'a generic page must not declare an icp specialization'
    );
  }

  const requiredJobs: PersuasionPlan['requiredJobs'][number][] = [];
  const proofGaps: PersuasionPlan['proofGaps'][number][] = [];
  const needs: {
    entry: (typeof research.benchmark)[number];
    need: z.output<typeof SectionJobNeedSchema>;
  }[] = [];

  for (const entry of research.benchmark) {
    const required = entry.status === 'weak' || entry.status === 'missing';
    if (entry.status === 'unsupported' && entry.need) {
      fail(
        `unsupported-planned:${entry.primitive}`,
        'an unsupported job must not be planned; marketing it today is untruthful'
      );
      continue;
    }
    if (!required) continue;
    if (isProofBearing(entry.primitive) && entry.claimIds.length === 0) {
      // Missing proof routes a proof-gap request, never fabricated proof.
      proofGaps.push({
        primitive: entry.primitive,
        reason: `no approved claim evidence for ${entry.primitive}; needs a proof request, not copy`,
      });
      requiredJobs.push({
        primitive: entry.primitive,
        job: entry.need?.job ?? entry.primitive,
        routed: 'proof-gap',
      });
      continue;
    }
    if (!entry.need) {
      fail(
        `required-job-need:${entry.primitive}`,
        'a weak or missing primitive needs a section job need to plan against'
      );
      continue;
    }
    needs.push({ entry, need: SectionJobNeedSchema.parse(entry.need) });
  }

  const gaps = detectSectionGaps(needs.map(item => item.need));
  for (const { entry, need } of needs) {
    const request = gaps.requests.find(candidate => candidate.job === need.job);
    const registryGap = gaps.registryGaps.find(
      candidate => candidate.job === need.job
    );
    requiredJobs.push({
      primitive: entry.primitive,
      job: need.job,
      routed: request
        ? 'section-request'
        : registryGap
          ? 'registry-gap'
          : 'section',
    });
  }

  return {
    plan: {
      requiredJobs,
      sectionRequests: gaps.requests,
      registryGaps: gaps.registryGaps,
      proofGaps,
    },
    failures,
  };
}
