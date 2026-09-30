import { describe, expect, it } from 'vitest';
import { resolveComposition } from '../composition';
import { SECTION_REQUEST_GOVERNANCE } from '../designGaps';
import { FACTORY_STAGE_ARTIFACT_SCHEMAS } from './spine';

const brief = (businessObjective: string) => ({
  businessObjective,
  targetAudience: 'general' as const,
  desiredConversion: 'start' as const,
  trafficSource: 'home' as const,
  intent: 'category' as const,
});

describe('factory section requests', () => {
  it('emits a request and degrades instead of forking a missing family', () => {
    const composition = resolveComposition(brief('Explain managed campaigns'), {
      sectionJobs: [
        {
          job: 'campaign-roi-calculator',
          contentShape: { headline: 44, body: 120 },
          mediaNeed: 'none',
          evidence: ['route:/solutions/agencies'],
        },
      ],
    });

    expect(composition.degraded).toBe(true);
    expect(composition.sectionRequests).toHaveLength(1);
    expect(composition.sectionRequests?.[0]).toMatchObject({
      job: 'campaign-roi-calculator',
      contentShape: 'body=120,headline=44',
      mediaNeed: 'none',
      evidence: expect.arrayContaining([
        'route:/solutions/agencies',
        expect.stringContaining('LANDING_PAGE_FAMILIES'),
      ]),
      dedupeKey: expect.stringMatching(/^factory:section-request:/),
    });
    expect(
      composition.sections.map(section => section.sectionId)
    ).not.toContain('campaign-roi-calculator');
    expect(composition.trace).toContainEqual(
      expect.objectContaining({ step: 'composition-degradation' })
    );
    expect(SECTION_REQUEST_GOVERNANCE.localComponentFallback).toBe('forbidden');
  });

  it('requests a section when its content exceeds every active variant budget', () => {
    const composition = resolveComposition(brief('Explain the product'), {
      sectionJobs: [
        {
          job: 'feature-split',
          contentShape: { headline: 65, body: 221 },
          mediaNeed: 'real-product-screenshot',
          evidence: ['route:/product'],
        },
      ],
    });

    expect(composition.degraded).toBe(true);
    expect(composition.sectionRequests?.[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'section.feature-split headline=65 exceeds desktop=64 or mobile=44'
        ),
        expect.stringContaining('design-gap:PROPOSED-SECTION-0001'),
      ])
    );
  });

  it('collapses the same gap from two pages into one request', () => {
    const need = {
      job: 'campaign-roi-calculator',
      contentShape: { headline: 44, body: 120 },
      mediaNeed: 'none',
    } as const;
    const firstPage = resolveComposition(brief('Agency page'), {
      sectionJobs: [{ ...need, evidence: ['route:/solutions/agencies'] }],
    });
    const secondPage = resolveComposition(brief('Enterprise page'), {
      sectionJobs: [{ ...need, evidence: ['route:/enterprise'] }],
      existingSectionRequests: firstPage.sectionRequests,
    });

    expect(secondPage.sectionRequests).toHaveLength(1);
    expect(secondPage.sectionRequests?.[0]?.evidence).toEqual(
      expect.arrayContaining(['route:/solutions/agencies', 'route:/enterprise'])
    );
    expect(secondPage.sectionRequests?.[0]?.dedupeKey).toBe(
      firstPage.sectionRequests?.[0]?.dedupeKey
    );

    const parsedGapReport = FACTORY_STAGE_ARTIFACT_SCHEMAS[
      'gap-detection'
    ].parse({
      pageId: 'two-pages',
      sectionRequests: secondPage.sectionRequests,
    });
    expect(parsedGapReport.sectionRequests[0]?.dedupeKey).toBe(
      secondPage.sectionRequests?.[0]?.dedupeKey
    );
  });
});
