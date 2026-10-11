import { describe, expect, it } from 'vitest';
import {
  buildPersuasionPlan,
  type CompetitiveResearch,
  PERSUASION_PRIMITIVES,
} from './persuasionBrief';

const AS_OF = '2026-09-30';

function research(
  overrides: Partial<CompetitiveResearch> = {}
): CompetitiveResearch {
  return {
    classification: {
      capability: 'public-profile',
      buyer: 'founder',
      intent: 'claim a public page that captures an audience',
      searchIntent: 'feature',
      pageScope: 'icp',
      specializes: 'public-profile',
    },
    researchedAt: AS_OF,
    sources: [
      { id: 'leader-a', kind: 'direct', evidenceRef: 'research/a-2026-09' },
      { id: 'adjacent-b', kind: 'adjacent', evidenceRef: 'research/b-2026-09' },
    ],
    benchmark: PERSUASION_PRIMITIVES.map(primitive => ({
      primitive,
      status: 'not-relevant' as const,
    })),
    differentiator: 'The page itself captures the audience.',
    ...overrides,
  };
}

const failureIds = (result: { failures: { id: string }[] }) =>
  result.failures.map(failure => failure.id);

describe('buildPersuasionPlan', () => {
  it('routes a required job a certified section serves to the section', () => {
    const result = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        benchmark: PERSUASION_PRIMITIVES.map(primitive =>
          primitive === 'pricing-risk-reduction'
            ? {
                primitive,
                status: 'weak' as const,
                need: {
                  job: 'cta',
                  contentShape: { headline: 40 },
                  mediaNeed: 'none',
                  evidence: ['claim:offer.free.price'],
                },
                claimIds: ['offer.free.price'],
              }
            : { primitive, status: 'strong' as const }
        ),
      }),
    });

    expect(result.failures).toEqual([]);
    expect(result.plan.requiredJobs).toEqual([
      {
        primitive: 'pricing-risk-reduction',
        job: 'cta',
        routed: 'section',
      },
    ]);
    expect(result.plan.sectionRequests).toEqual([]);
    expect(result.plan.proofGaps).toEqual([]);
  });

  it('routes a job no certified section serves to the section-request flow', () => {
    const result = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        benchmark: PERSUASION_PRIMITIVES.map(primitive =>
          primitive === 'product-demo-above-fold'
            ? {
                primitive,
                status: 'missing' as const,
                need: {
                  job: 'interactive-roi-calculator',
                  contentShape: { headline: 40 },
                  mediaNeed: 'none',
                  evidence: ['research:calculator-expectation'],
                },
              }
            : { primitive, status: 'strong' as const }
        ),
      }),
    });

    expect(result.failures).toEqual([]);
    expect(result.plan.requiredJobs).toEqual([
      {
        primitive: 'product-demo-above-fold',
        job: 'interactive-roi-calculator',
        routed: 'section-request',
      },
    ]);
    expect(result.plan.sectionRequests).toHaveLength(1);
  });

  it('records a proof gap instead of fabricating a required proof job', () => {
    const result = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        benchmark: PERSUASION_PRIMITIVES.map(primitive =>
          primitive === 'customer-logo-proof'
            ? { primitive, status: 'missing' as const }
            : { primitive, status: 'strong' as const }
        ),
      }),
    });

    expect(result.failures).toEqual([]);
    expect(result.plan.requiredJobs).toEqual([
      {
        primitive: 'customer-logo-proof',
        job: 'customer-logo-proof',
        routed: 'proof-gap',
      },
    ]);
    expect(result.plan.proofGaps).toHaveLength(1);
    expect(result.plan.sectionRequests).toEqual([]);
  });

  it('fails a benchmark that skips a primitive or plans an unsupported job', () => {
    const skipped = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        benchmark: PERSUASION_PRIMITIVES.filter(
          primitive => primitive !== 'faq-objections'
        ).map(primitive => ({ primitive, status: 'strong' as const })),
      }),
    });
    expect(failureIds(skipped)).toContain('benchmark-complete');

    const unsupported = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        benchmark: PERSUASION_PRIMITIVES.map(primitive =>
          primitive === 'quantified-proof'
            ? {
                primitive,
                status: 'unsupported' as const,
                need: {
                  job: 'stats',
                  contentShape: { headline: 40 },
                  mediaNeed: 'none',
                  evidence: ['x'],
                },
              }
            : { primitive, status: 'strong' as const }
        ),
      }),
    });
    expect(failureIds(unsupported)).toContain(
      'unsupported-planned:quantified-proof'
    );
  });

  it('fails stale, future-dated or one-dimensional research', () => {
    const stale = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({ researchedAt: '2026-01-01' }),
    });
    expect(failureIds(stale)).toContain('research-fresh');

    const future = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({ researchedAt: '2026-10-15' }),
    });
    expect(failureIds(future)).toContain('research-fresh');

    const narrow = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        sources: [
          { id: 'leader-a', kind: 'direct', evidenceRef: 'research/a' },
          { id: 'leader-b', kind: 'direct', evidenceRef: 'research/b' },
        ],
      }),
    });
    expect(failureIds(narrow)).toContain('research-breadth');
  });

  it('enforces the generic-vs-icp taxonomy', () => {
    const icpWithoutCapability = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        classification: {
          ...research().classification,
          specializes: undefined,
        },
      }),
    });
    expect(failureIds(icpWithoutCapability)).toContain('taxonomy-scope');

    const genericWithSpecialization = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        classification: {
          ...research().classification,
          pageScope: 'generic',
          specializes: 'public-profile',
        },
      }),
    });
    expect(failureIds(genericWithSpecialization)).toContain('taxonomy-scope');
  });

  it('fails a required job that names no section need', () => {
    const result = buildPersuasionPlan({
      asOf: AS_OF,
      research: research({
        benchmark: PERSUASION_PRIMITIVES.map(primitive =>
          primitive === 'faq-objections'
            ? { primitive, status: 'weak' as const }
            : { primitive, status: 'strong' as const }
        ),
      }),
    });

    expect(failureIds(result)).toContain('required-job-need:faq-objections');
  });
});
